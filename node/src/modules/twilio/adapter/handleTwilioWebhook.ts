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
import {
  generateBotResponse,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
  // tipa os produtos no formato esperado pelo adapter
  Product as LLMProduct,
} from '../../integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery, fallbackScore } from '../../../utils/search';
import { occupiedRooms, simulateTwilioSocket, pausedRooms } from '../../integration/application/roomManagement';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

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
    const twilioOwner = twilioEntry.owner;

    // 2) Busca o bot do owner + produtos populados
    const bot = await Bot.findOne({ owner: twilioOwner }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) {
      res.status(404).send();
      return;
    }
    const b = bot as NonNullable<typeof bot>;

    // 3) Consolida docs de produtos + ids + nomes para whitelist
    const productDocs: IProduct[] = Array.isArray(b.product) ? (b.product as IProduct[]) : ([b.product] as IProduct[]);
    const productIds = productDocs.map((p) => p._id);
    const allProductNames = productDocs.map((p) => p.name);

    // 4) Função de mapeamento para o tipo LLMProduct
    const mapDocToLLMProduct = (p: any): LLMProduct => ({
      id: p.id_external || String(p._id),
      category: p.category || 'Outro',
      name: p.name || '',
      description: p.description || '',
      // usa price_eur prioritariamente; cai para price (legado) ou 0
      price: typeof p.price_eur === 'number' ? p.price_eur : (typeof p.price === 'number' ? p.price : 0),
      price_eur: typeof p.price_eur === 'number' ? p.price_eur : (typeof p.price === 'number' ? p.price : null),
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

    // 5) Monta a "carta completa" (allProducts) no formato do adapter
    //    (usa find para garantir campos completos e lean para desempenho)
    const allProductsRaw = await Product.find({ _id: { $in: productIds } })
      .select({
        id_external: 1,
        category: 1,
        name: 1,
        description: 1,
        price: 1,
        price_eur: 1,
        allergens: 1,
        contains_pork: 1,
        spicy: 1,
        vegetarian: 1,
        vegan: 1,
        pregnancy_unsuitable: 1,
        recommended_alcoholic: 1,
        recommended_non_alcoholic: 1,
        notes: 1,
        isTakeaway: 1,
        takeawayLink: 1,
        imageUrl: 1,
      })
      .lean();

    const allProducts: LLMProduct[] = allProductsRaw.map(mapDocToLLMProduct);

    // 6) História curta (últimas 3 mensagens)
    const history: ChatHistoryItem[] = [];
    const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(1).lean();
    lastMsgs.reverse().forEach((m) => {
      history.push({
        role: m.sender === 'Bot' ? 'assistant' : 'user',
        content: m.message || '',
      });
    });

    // 7) Memória leve do cliente
    let memory: MemoryContext = {};
    const memDoc = await ClientMemory.findOne({ clientId: fromClean }).lean();
    if (memDoc) {
      memory = {
        topics: memDoc.topicsAgg ?? [],
        sentiment: memDoc.sentimentAgg ?? 'neutral',
      };
    }

    // 8) Seleciona produtos relevantes para a mensagem do usuário
    async function selectRelevantProducts(userText: string): Promise<LLMProduct[]> {
      const textQuery = buildTextSearchQuery(userText);

      let relevantRaw = await Product.find({
        _id: { $in: productIds },
        ...(textQuery ? { $text: { $search: textQuery } } : {}),
      })
        .select({
          id_external: 1,
          category: 1,
          name: 1,
          description: 1,
          price: 1,
          price_eur: 1,
          allergens: 1,
          contains_pork: 1,
          spicy: 1,
          vegetarian: 1,
          vegan: 1,
          pregnancy_unsuitable: 1,
          recommended_alcoholic: 1,
          recommended_non_alcoholic: 1,
          notes: 1,
          isTakeaway: 1,
          takeawayLink: 1,
          imageUrl: 1,
          score: { $meta: 'textScore' },
        })
        .sort(textQuery ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .limit(5)
        .lean();

      // Fallback simples por similaridade se nada veio do text index
      if (!relevantRaw.length) {
        const all = await Product.find({ _id: { $in: productIds } })
          .select({
            id_external: 1,
            category: 1,
            name: 1,
            description: 1,
            price: 1,
            price_eur: 1,
            allergens: 1,
            contains_pork: 1,
            spicy: 1,
            vegetarian: 1,
            vegan: 1,
            pregnancy_unsuitable: 1,
            recommended_alcoholic: 1,
            recommended_non_alcoholic: 1,
            notes: 1,
            isTakeaway: 1,
            takeawayLink: 1,
            imageUrl: 1,
          })
          .lean();

        relevantRaw = (all as any[])
          .map((p) => ({ ...p, __score: fallbackScore(userText, p.name, p.description) }))
          .sort((a: any, b: any) => b.__score - a.__score)
          .slice(0, 5);
      }

      // Se ainda assim não houver nada, pega alguns arbitrários só para ter contexto
      if (!relevantRaw.length) {
        relevantRaw = await Product.find({ _id: { $in: productIds } })
          .select({
            id_external: 1,
            category: 1,
            name: 1,
            description: 1,
            price: 1,
            price_eur: 1,
            allergens: 1,
            contains_pork: 1,
            spicy: 1,
            vegetarian: 1,
            vegan: 1,
            pregnancy_unsuitable: 1,
            recommended_alcoholic: 1,
            recommended_non_alcoholic: 1,
            notes: 1,
            isTakeaway: 1,
            takeawayLink: 1,
            imageUrl: 1,
          })
          .limit(3)
          .lean();
      }

      return relevantRaw.map(mapDocToLLMProduct);
    }

    // 9) Responder com o bot (LLM)
    async function replyWithBot(message: string) {
      const adapterProducts: LLMProduct[] = await selectRelevantProducts(message);

      // Sem relevantes → resposta curta sem LLM
      if (adapterProducts.length === 0) {
        const langGuess = detectLang(message);
        type LangKey = 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar';
        const top3 = allProductNames.slice(0, 3);

        const msgByLang: Record<LangKey, string> = {
          pt: `Não temos esse item. Disponíveis: ${top3.join(', ')}. Posso sugerir algo do cardápio?`,
          es: `No tenemos ese ítem. Disponibles: ${top3.join(', ')}. ¿Te sugiero algo del menú?`,
          en: `We don't have that item. Available: ${top3.join(', ')}. Would you like a menu suggestion?`,
          it: `Non abbiamo quell'articolo. Disponibili: ${top3.join(', ')}. Vuoi un suggerimento dal menu?`,
          fr: `Nous n'avons pas cet article. Disponibles : ${top3.join(', ')}. Voulez-vous une suggestion du menu ?`,
          ar: `هذا الصنف غير متوفر. المتاح: ${top3.join(', ')}. هل تريد اقتراحًا من القائمة؟`,
        };

        const out = msgByLang[(langGuess ?? 'pt') as LangKey];
        await sendMessageToTwilio(out, String(From).replace('whatsapp:', ''), String(To));
        io.to(roomId).emit('twilio message', { sender: 'Bot', message: out });
        await saveMessage(roomId, 'Bot', out, true);
        io.emit('historicalRoomUpdated', { roomId, lastMessage: out, lastTimestamp: new Date() });
        return;
      }

      // Com relevantes → chama o LLM com a whitelist e extras (about/guidelines)
      const resposta = await generateBotResponse(
        b.name ?? 'Enki',                          // botName
        b.persona ?? 'atendente simpática',        // persona
        adapterProducts,                           // relevantes (LLMProduct[])
        allProducts,                               // carta completa (LLMProduct[])
        b.temperature ?? 0.5,                      // temperatura
        message,                                   // userInput
        {
          name: b.companyName ?? 'Empresa',
          address: b.address ?? 'Endereço',
          email: b.email ?? 'email@empresa.com',
          phone: b.phone ?? '(00) 00000-0000',
        },                                         // companyData
        history,                                   // histórico curto
        memory,                                    // memória leve
        { userInputLanguage: detectLang(message) },// idioma detectado
        allProductNames,                           // whitelist de nomes
        { about: b.about, guidelines: b.guidelines } // extras
      );

      if (!resposta) return;
      await sendMessageToTwilio(resposta, String(From).replace('whatsapp:', ''), String(To));
      io.to(roomId).emit('twilio message', { sender: 'Bot', message: resposta });
      await saveMessage(roomId, 'Bot', resposta, true);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: resposta, lastTimestamp: new Date() });
    }

    // 10) Download de mídia (se houver)
    async function handleFile() {
      const fileName = String(MediaUrl0).split('/').pop() || 'file_0';
      const filePath = path.join(uploadDir, fileName);
      await downloadFile(MediaUrl0, filePath);

      const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
      const fileType = MediaContentType0 || 'application/octet-stream';

      await saveMessage(roomId, sender, '', true, fileUrl, fileName, twilioOwner);
      const event = fileType.startsWith('audio/') ? 'audio message' : 'file message';
      io.to(roomId).emit(event, { sender, fileName, fileUrl, fileType, source: 'twilio' });

      io.emit('historicalRoomUpdated', { roomId, lastMessage: fileName, lastTimestamp: new Date() });
    }

    // 11) Garante sala simulada para twilio
    if (!occupiedRooms.has(roomId)) {
      occupiedRooms.add(roomId);
      simulateTwilioSocket(io, roomId);
    }

    // 12) Persiste a mensagem recebida
    if (Body) {
      io.to(roomId).emit('twilio message', { sender, message: Body });
      await saveMessage(roomId, sender, Body, true, undefined, undefined, twilioOwner);
      io.emit('historicalRoomUpdated', { roomId, lastMessage: Body, lastTimestamp: new Date() });
    }

    // 13) Trata mídia e responde com bot (se não estiver pausado)
    if (MediaUrl0) await handleFile();
    if (Body && !pausedRooms.has(roomId)) await replyWithBot(Body);

    // Opcional: res.status(200).send();
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
    // Opcional: res.status(500).json({ error: 'Erro inesperado no webhook.' });
  }
};
