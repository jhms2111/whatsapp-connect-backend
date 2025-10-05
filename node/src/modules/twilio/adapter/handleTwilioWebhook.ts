// src/modules/twilio/adapter/handleTwilioWebhook.ts
import { Server as IOServer } from 'socket.io';
import { Request, Response } from 'express';
import path from 'path';
import { downloadFile } from './downloadFile';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { sendMessageToTwilio } from './config';
import Bot from '../../../infraestructure/mongo/models/botModel';
import TwilioNumber from '../../../infraestructure/mongo/models/twilioNumberModel';
import Message from '../../../infraestructure/mongo/models/messageModel';
import ClientMemory from '../../../infraestructure/mongo/models/clientMemoryModel';
import Product, { IProduct } from '../../../infraestructure/mongo/models/productModel';
import ConversationQuota from '../../../infraestructure/mongo/models/conversationQuotaModel';

import {
  generateBotResponse,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
  Product as LLMProduct,
} from '../../integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery } from '../../../utils/search';
import { occupiedRooms, simulateTwilioSocket, pausedRooms } from '../../integration/application/roomManagement';

// 🔒 consumo atômico
import { spendCharacters } from '../../billing/usage';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

const CHARS_PER_CONVERSATION = 500;

export const handleTwilioWebhook = async (req: Request, res: Response, io: IOServer): Promise<void> => {
  const { From, To, Body, MediaUrl0, MediaContentType0 } = req.body;

  const fromClean = String(From).replace('whatsapp:', '').replace(/\W/g, '');
  const toClean = String(To).replace('whatsapp:', '').replace(/\W/g, '');
  const roomId = `${fromClean}___${toClean}`;
  const sender = `Socket-twilio-${roomId}`;

  try {
    // 1) Verifica número do Twilio
    const twilioEntry = await TwilioNumber.findOne({ number: To });
    if (!twilioEntry) {
      res.status(404).json({ error: 'Número não autorizado.' });
      return;
    }
    // Dono do número: é quem "paga" e acumula os caracteres
    const billingUsername = twilioEntry.owner;

    // 2) Busca o bot do owner + produtos
    const bot = await Bot.findOne({ owner: billingUsername }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) {
      res.status(404).send();
      return;
    }
    const b = bot as NonNullable<typeof bot>;
    const productDocs: IProduct[] = Array.isArray(b.product) ? (b.product as IProduct[]) : [b.product as IProduct];
    const productIds = productDocs.map((p) => p._id);

    const mapDocToLLMProduct = (p: any): LLMProduct => ({
      id: p.id_external || String(p._id),
      category: p.category || 'Outro',
      name: p.name || '',
      description: p.description || '',
      price: typeof p.price_eur === 'number' ? p.price_eur : 0,
      price_eur: typeof p.price_eur === 'number' ? p.price_eur : null,
      allergens: Array.isArray(p.allergens) ? p.allergens : [],
      contains_pork: !!p.contains_pork,
      spicy: !!p.spicy,
      vegetarian: !!p.vegetarian,
      vegan: !!p.vegan,
      pregnancy_unsuitable: !!p.pregnancy_unsuitable,
      recommended_alcoholic: p.recommended_alcoholic ?? null,
      recommended_non_alcoholic: p.recommended_non_alcoholic ?? null,
      notes: p.notes ?? null,
      imageUrl: p.imageUrl || undefined,
    });

    const allProductsRaw = await Product.find({ _id: { $in: productIds } }).lean();
    const allProducts: LLMProduct[] = allProductsRaw.map(mapDocToLLMProduct);

    // 3) História curta
    const history: ChatHistoryItem[] = [];
    const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(3).lean();
    lastMsgs.reverse().forEach((m) => {
      history.push({
        role: m.sender === 'Bot' ? 'assistant' : 'user',
        content: m.message || '',
      });
    });

    // 4) Memória leve
    let memory: MemoryContext = {};
    const memDoc = await ClientMemory.findOne({ clientId: fromClean }).lean();
    if (memDoc) {
      memory = {
        topics: memDoc.topicsAgg ?? [],
        sentiment: memDoc.sentimentAgg ?? 'neutral',
      };
    }

    // 5) Seleção de produtos relevantes
    async function selectRelevantProducts(userText: string): Promise<LLMProduct[]> {
      const textQuery = buildTextSearchQuery(userText);
      let relevantRaw = await Product.find({
        _id: { $in: productIds },
        ...(textQuery ? { $text: { $search: textQuery } } : {}),
      })
        .lean()
        .limit(5);

      if (!relevantRaw.length) {
        relevantRaw = await Product.find({ _id: { $in: productIds } }).limit(3).lean();
      }
      return relevantRaw.map(mapDocToLLMProduct);
    }

    // 🔎 helper: checa se ainda há saldo de caracteres
    async function hasRemainingChars(username: string) {
      const q = await ConversationQuota.findOne(
        { username },
        { totalConversations: 1, usedCharacters: 1 }
      ).lean();
      if (!q || !q.totalConversations) return false;
      const maxChars = q.totalConversations * CHARS_PER_CONVERSATION;
      return (q.usedCharacters || 0) < maxChars;
    }

    // 6) Responder com o bot debitando SAÍDA
    async function replyWithBot(userMessage: string) {
      const adapterProducts: LLMProduct[] = await selectRelevantProducts(userMessage);

      const resposta = await generateBotResponse(
        b.name ?? 'Enki',
        b.persona ?? 'atendente simpática',
        adapterProducts,
        allProducts,
        b.temperature ?? 0.5,
        userMessage,
        {
          name: b.companyName ?? 'Empresa',
          address: b.address ?? 'Endereço',
          email: b.email ?? 'email@empresa.com',
          phone: b.phone ?? '(00) 00000-0000',
        },
        history,
        memory,
        { userInputLanguage: detectLang(userMessage) },
        productDocs.map((p) => p.name),
        { about: b.about, guidelines: b.guidelines },
      );

      if (!resposta) return;

      // Antes de enviar, confirma saldo novamente
      const canStillReply = await hasRemainingChars(billingUsername);
      if (!canStillReply) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';
        await sendMessageToTwilio(aviso, fromClean, To);
        io.to(roomId).emit('twilio message', { sender: 'Bot', message: aviso });
        await saveMessage(roomId, 'Bot', aviso, true);
        return;
      }

      // Envia resposta e salva
      await sendMessageToTwilio(resposta, fromClean, To);
      io.to(roomId).emit('twilio message', { sender: 'Bot', message: resposta });
      await saveMessage(roomId, 'Bot', resposta, true);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: resposta, lastTimestamp: new Date() });

      // Debita caracteres da SAÍDA (atômico + corte no limite)
      try {
        await spendCharacters(billingUsername, resposta.length || 0);
      } catch (e) {
        console.error('[BILLING] Falha ao debitar resposta do bot:', e);
      }
    }

    // 7) Download de mídia (se houver)
    async function handleFile() {
      if (!MediaUrl0) return;
      const fileName = String(MediaUrl0).split('/').pop() || 'file_0';
      const filePath = path.join(uploadDir, fileName);
      await downloadFile(MediaUrl0, filePath);

      const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
      const fileType = MediaContentType0 || 'application/octet-stream';
      await saveMessage(roomId, sender, '', true, fileUrl, fileName, billingUsername);
      const event = fileType.startsWith('audio/') ? 'audio message' : 'file message';
      io.to(roomId).emit(event, { sender, fileName, fileUrl, fileType, source: 'twilio' });
      io.emit('historicalRoomUpdated', { roomId, lastMessage: fileName, lastTimestamp: new Date() });
      // Política atual: mídia não consome caracteres. Ajuste se necessário.
    }

    // 8) Cria sala se não existir
    if (!occupiedRooms.has(roomId)) {
      occupiedRooms.add(roomId);
      simulateTwilioSocket(io, roomId);
    }

    // 9) Entrada do usuário
    if (Body) {
      // Se não há saldo, não registra consumo nem segue — apenas informa
      const canReplyNow = await hasRemainingChars(billingUsername);
      if (!canReplyNow) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';
        await sendMessageToTwilio(aviso, fromClean, To);
        io.to(roomId).emit('twilio message', { sender: 'Bot', message: aviso });
        await saveMessage(roomId, 'Bot', aviso, true);
        res.status(200).send('Package exhausted');
        return;
      }

      // Debita ENTRADA de forma atômica (corta se necessário)
      try {
        await spendCharacters(billingUsername, Body.length || 0);
      } catch (e) {
        console.error('[BILLING] Falha ao debitar mensagem do usuário:', e);
      }

      // Persiste mensagem do usuário
      io.to(roomId).emit('twilio message', { sender, message: Body });
      await saveMessage(roomId, sender, Body, true, undefined, undefined, billingUsername);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: Body, lastTimestamp: new Date() });
    }

    // 10) Trata mídia
    await handleFile();

    // 11) Responde com bot (se não estiver pausado)
    if (Body && !pausedRooms.has(roomId)) {
      await replyWithBot(Body);
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
    res.status(500).send('Erro interno');
  }
};
