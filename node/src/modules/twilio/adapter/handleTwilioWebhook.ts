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
import Cliente, { ICliente } from '../../../infraestructure/mongo/models/clienteModel';
import ClientMemory from '../../../infraestructure/mongo/models/clientMemoryModel';
import Product, { IProduct } from '../../../infraestructure/mongo/models/productModel';
import ConversationQuota from '../../../infraestructure/mongo/models/conversationQuotaModel';
import FollowUpSchedule from '../../../infraestructure/mongo/models/followUpQueueModel';

import {
  generateBotResponse,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
  Product as LLMProduct,
} from '../../integration/Chatgpt/chatGptAdapter';

import { buildTextSearchQuery } from '../../../utils/search';
import { occupiedRooms, simulateTwilioSocket, pausedRooms } from '../../integration/application/roomManagement';

import { spendCharacters } from '../../billing/usage';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

const CHARS_PER_CONVERSATION = 500;

async function getOwnerFlags(username: string): Promise<{ blocked: boolean; botsEnabled: boolean }> {
  const cli = await Cliente.findOne(
    { username },
    { status: 1, botsEnabled: 1 }
  ).lean<{ status?: 'active' | 'blocked'; botsEnabled?: boolean }>().exec();

  const blocked = ((cli?.status ?? 'active') === 'blocked');
  const botsEnabled = typeof cli?.botsEnabled === 'boolean' ? cli.botsEnabled : true;
  return { blocked, botsEnabled };
}

export const handleTwilioWebhook = async (req: Request, res: Response, io: IOServer): Promise<void> => {
  const { From, To, Body, MediaUrl0, MediaContentType0 } = req.body;

  const fromClean = String(From).replace('whatsapp:', '').replace(/\W/g, '');
  const toClean = String(To).replace('whatsapp:', '').replace(/\W/g, '');
  const roomId = `${fromClean}___${toClean}`;
  const sender = `Socket-twilio-${roomId}`;

  try {
    // 1) Verifica número do Twilio — aceita com/sem prefixo
    const rawTo  = String(To);                      // ex: "whatsapp:+18313184212"
    const toBare = rawTo.replace(/^whatsapp:/, ''); // ex: "+18313184212"
    const withWp = `whatsapp:${toBare}`;

    const twilioEntry = await TwilioNumber.findOne({
      number: { $in: [rawTo, toBare, withWp] },
    }).lean();

    if (!twilioEntry) {
      console.warn('[WEBHOOK] Número Twilio NÃO autorizado:', { tried: [rawTo, toBare, withWp] });
      res.status(404).json({ error: 'Número não autorizado.' });
      return;
    }

    const billingUsername = twilioEntry.owner;

    // 2) Agenda/reatualiza follow-up (pré-programado) — NÃO usa IA
    try {
      const cli = await Cliente.findOne(
        { username: billingUsername },
        { followUpEnabled: 1, followUpDelayMinutes: 1 }
      ).lean<ICliente>();

      if (cli?.followUpEnabled) {
        const fuDelay = (cli.followUpDelayMinutes ?? 60) || 60;
        const due = new Date(Date.now() + fuDelay * 60 * 1000);

        // 1 pendente por conversa (owner+from+to, sent:false)
        await FollowUpSchedule.findOneAndUpdate(
          { ownerUsername: billingUsername, from: String(From), to: String(To), sent: false },
          { $set: { scheduledAt: due }, $setOnInsert: { sent: false } },
          { upsert: true, new: true }
        ).lean().exec();
      }
    } catch (e) {
      console.error('[WEBHOOK][follow-up] falha ao agendar:', e);
    }

    // 3) Flags
    const { blocked, botsEnabled } = await getOwnerFlags(billingUsername);

    // Sala viva
    if (!occupiedRooms.has(roomId)) {
      occupiedRooms.add(roomId);
      simulateTwilioSocket(io, roomId);
    }

    const persistIncoming = async () => {
      if (Body) {
        io.to(roomId).emit('twilio message', { sender, message: Body });
        await saveMessage(roomId, sender, Body, true, undefined, undefined, billingUsername);
        io.emit('historicalRoomUpdated', { roomId, lastMessage: Body, lastTimestamp: new Date() });
      }
      if (MediaUrl0) {
        const fileName = String(MediaUrl0).split('/').pop() || 'file_0';
        const filePath = path.join(uploadDir, fileName);
        await downloadFile(MediaUrl0, filePath);

        const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
        const fileType = MediaContentType0 || 'application/octet-stream';
        await saveMessage(roomId, sender, '', true, fileUrl, fileName, billingUsername);
        const event = fileType.startsWith('audio/') ? 'audio message' : 'file message';
        io.to(roomId).emit(event, { sender, fileName, fileUrl, fileType, source: 'twilio' });
        io.emit('historicalRoomUpdated', { roomId, lastMessage: fileName, lastTimestamp: new Date() });
      }
    };

    if (blocked) {
      await persistIncoming();
      res.status(200).send('IGNORED_BLOCKED_USER');
      return;
    }

    if (!botsEnabled) {
      await persistIncoming();
      res.status(200).send('IGNORED_BOTS_DISABLED');
      return;
    }

    // 4) Bot + produtos
    const bot = await Bot.findOne({ owner: billingUsername }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) {
      await persistIncoming();
      res.status(200).send('NO_BOT_FOR_OWNER');
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

    // 5) História curta
    const history: ChatHistoryItem[] = [];
    const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(3).lean();
    lastMsgs.reverse().forEach((m) => {
      history.push({
        role: m.sender === 'Bot' ? 'assistant' : 'user',
        content: m.message || '',
      });
    });

    // 6) Memória
    let memory: MemoryContext = {};
    const memDoc = await ClientMemory.findOne({ clientId: fromClean }).lean();
    if (memDoc) {
      memory = {
        topics: memDoc.topicsAgg ?? [],
        sentiment: memDoc.sentimentAgg ?? 'neutral',
      };
    }

    // 7) Seleção de produtos
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

    async function hasRemainingChars(username: string) {
      const q = await ConversationQuota.findOne(
        { username },
        { totalConversations: 1, usedCharacters: 1 }
      ).lean();
      if (!q || !q.totalConversations) return false;
      const maxChars = q.totalConversations * CHARS_PER_CONVERSATION;
      return (q.usedCharacters || 0) < maxChars;
    }

    // 8) Persistir entrada
    if (Body) {
      const canReplyNow = await hasRemainingChars(billingUsername);
      if (!canReplyNow) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';
        await sendMessageToTwilio(aviso, fromClean, To);
        io.to(roomId).emit('twilio message', { sender: 'Bot', message: aviso });
        await saveMessage(roomId, 'Bot', aviso, true);
        res.status(200).send('Package exhausted');
        return;
      }

      try {
        await spendCharacters(billingUsername, Body.length || 0);
      } catch (e) {
        console.error('[BILLING] Falha ao debitar mensagem do usuário:', e);
      }

      io.to(roomId).emit('twilio message', { sender, message: Body });
      await saveMessage(roomId, sender, Body, true, undefined, undefined, billingUsername);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: Body, lastTimestamp: new Date() });
    }

    // Mídia
    if (MediaUrl0) {
      const fileName = String(MediaUrl0).split('/').pop() || 'file_0';
      const filePath = path.join(uploadDir, fileName);
      await downloadFile(MediaUrl0, filePath);

      const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
      const fileType = MediaContentType0 || 'application/octet-stream';
      await saveMessage(roomId, sender, '', true, fileUrl, fileName, billingUsername);
      const event = fileType.startsWith('audio/') ? 'audio message' : 'file message';
      io.to(roomId).emit(event, { sender, fileName, fileUrl, fileType, source: 'twilio' });
      io.emit('historicalRoomUpdated', { roomId, lastMessage: fileName, lastTimestamp: new Date() });
    }

    if (!Body) {
      res.status(200).send('Webhook processed (no text)');
      return;
    }

    if (pausedRooms.has(roomId)) {
      res.status(200).send('Room paused; no bot reply');
      return;
    }

    const adapterProducts: LLMProduct[] = await selectRelevantProducts(Body);

    let resposta: string | undefined;
    try {
      resposta = await generateBotResponse(
        b.name ?? 'Enki',
        b.persona ?? 'atendente simpática',
        adapterProducts,
        allProducts,
        b.temperature ?? 0.5,
        Body,
        {
          name: b.companyName ?? 'Empresa',
          address: b.address ?? 'Endereço',
          email: b.email ?? 'email@empresa.com',
          phone: b.phone ?? '(00) 00000-0000',
        },
        history,
        memory,
        { userInputLanguage: detectLang(Body) },
        productDocs.map((p) => p.name),
        { about: b.about, guidelines: b.guidelines },
      );
    } catch (err) {
      console.error('[WEBHOOK] Falha ao chamar IA (seguindo sem responder):', err);
      resposta = undefined;
    }

    if (resposta) {
      const canStillReply = await hasRemainingChars(billingUsername);
      if (!canStillReply) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';
        await sendMessageToTwilio(aviso, fromClean, To);
        io.to(roomId).emit('twilio message', { sender: 'Bot', message: aviso });
        await saveMessage(roomId, 'Bot', aviso, true);
        res.status(200).send('Package exhausted (post-gen)');
        return;
      }

      await sendMessageToTwilio(resposta, fromClean, To);
      io.to(roomId).emit('twilio message', { sender: 'Bot', message: resposta });
      await saveMessage(roomId, 'Bot', resposta, true);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: resposta, lastTimestamp: new Date() });

      try {
        await spendCharacters(billingUsername, resposta.length || 0);
      } catch (e) {
        console.error('[BILLING] Falha ao debitar resposta do bot:', e);
      }
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
    res.status(200).send('IGNORED_ERROR_TOPLEVEL');
  }
};
