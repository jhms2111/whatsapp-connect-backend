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
import CatalogItem from '../../../infraestructure/mongo/models/catalogItemModel';
import ConversationQuota from '../../../infraestructure/mongo/models/conversationQuotaModel';
import FollowUpSchedule from '../../../infraestructure/mongo/models/followUpQueueModel';

import {
  generateBotResponse,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
  Product as LLMProduct,
} from '../../integration/Chatgpt/chatGptAdapter';

import { buildTextSearchQuery, fallbackScore } from '../../../utils/search';
import { occupiedRooms, simulateTwilioSocket, pausedRooms } from '../../integration/application/roomManagement';

import { spendCharacters } from '../../billing/usage';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

const CHARS_PER_CONVERSATION = 500;

/** =================== Normalização WhatsApp =================== */
function asWhatsapp(input: string): string {
  const s = String(input ?? '').trim();
  if (!s) return 'whatsapp:+';

  // já está no formato whatsapp:
  if (s.startsWith('whatsapp:')) {
    const rest = s.slice('whatsapp:'.length).trim();
    if (rest.startsWith('+')) return `whatsapp:${rest}`;
    return `whatsapp:+${rest.replace(/\D/g, '')}`;
  }

  // veio com +
  if (s.startsWith('+')) return `whatsapp:${s}`;

  // veio "cru" (só dígitos ou com lixo)
  return `whatsapp:+${s.replace(/\D/g, '')}`;
}

function cleanDigits(input: string): string {
  return String(input ?? '').replace(/^whatsapp:/, '').replace(/\D/g, '');
}
/** ============================================================= */

/** ========= Helpers CatalogItem -> LLMProduct ========= */
function pickStr(values: Record<string, any>, keys: string[], fallback = '') {
  for (const k of keys) {
    const v = values?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}
function pickNum(values: Record<string, any>, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = values?.[k];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function catalogItemToLLMProduct(ci: any): LLMProduct {
  const v = (ci?.values || {}) as Record<string, any>;
  const name = pickStr(v, ['title', 'name', 'nome', 'título', 'titulo'], `#${ci?._id}`);
  const description = pickStr(v, ['description', 'descrição', 'descricao', 'descripcion'], '');
  const category = pickStr(v, ['category', 'categoria', 'tipo'], 'outro');
  const price = pickNum(v, ['price', 'preço', 'preco', 'price_eur'], 0);
  const price_eur = Number.isFinite(v?.price_eur) ? Number(v.price_eur) : undefined;
  const allergens = Array.isArray(v.allergens) ? v.allergens : [];
  const contains_pork = !!(v.contains_pork ?? v.porco);
  const spicy = !!(v.spicy ?? v.picante);
  const vegetarian = !!(v.vegetarian ?? v.vegetariano);
  const vegan = !!(v.vegan ?? v.vegano);
  const pregnancy_unsuitable = !!(v.pregnancy_unsuitable ?? v.gravidas_nao_recomendado);
  const imageUrl =
    Array.isArray(ci.images) && ci.images.length
      ? ci.images[0]
      : typeof v.image === 'string'
      ? v.image
      : undefined;

  return {
    id: String(ci._id),
    category,
    name,
    description,
    price,
    price_eur: typeof price_eur === 'number' ? price_eur : null,
    allergens,
    contains_pork,
    spicy,
    vegetarian,
    vegan,
    pregnancy_unsuitable,
    recommended_alcoholic: v.recommended_alcoholic ?? null,
    recommended_non_alcoholic: v.recommended_non_alcoholic ?? null,
    notes: v.notes ?? null,
    imageUrl,
  };
}
/** ===================================================== */

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

  // ✅ Use valores normalizados p/ envio (Twilio exige whatsapp:+E164)
  const toWp = asWhatsapp(From);   // enviar PARA quem mandou
  const fromWp = asWhatsapp(To);   // enviar DO número Twilio (o que recebeu)

  // ✅ Use versões limpas apenas para IDs internos
  const fromClean = cleanDigits(From);
  const toClean = cleanDigits(To);

  const roomId = `${fromClean}___${toClean}`;
  const sender = `Socket-twilio-${roomId}`;

  try {
    // ✅ Autorização do número Twilio (usando variações)
    const rawTo = String(To);
    const toBare = rawTo.replace(/^whatsapp:/, '');
    const withWp = `whatsapp:${toBare}`;

    const twilioEntry = await TwilioNumber.findOne({ number: { $in: [rawTo, toBare, withWp] } }).lean();
    if (!twilioEntry) {
      console.warn('[WEBHOOK] Número Twilio NÃO autorizado:', { tried: [rawTo, toBare, withWp] });
      res.status(404).json({ error: 'Número não autorizado.' });
      return;
    }
    const billingUsername = twilioEntry.owner;

    // Follow-up
    try {
      const cli = await Cliente.findOne({ username: billingUsername }, { followUpEnabled: 1, followUpDelayMinutes: 1 })
        .lean<ICliente>();
      if (cli?.followUpEnabled) {
        const fuDelay = (cli.followUpDelayMinutes ?? 60) || 60;
        const due = new Date(Date.now() + fuDelay * 60 * 1000);
        await FollowUpSchedule.findOneAndUpdate(
          { ownerUsername: billingUsername, from: String(From), to: String(To), sent: false },
          { $set: { scheduledAt: due }, $setOnInsert: { sent: false } },
          { upsert: true, new: true }
        ).lean().exec();
      }
    } catch (e) {
      console.error('[WEBHOOK][follow-up] falha ao agendar:', e);
    }

    const { blocked, botsEnabled } = await getOwnerFlags(billingUsername);

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

    const bot = await Bot.findOne({ owner: billingUsername })
      .populate<{ product: IProduct | IProduct[] }>('product')
      .populate('catalogItems');

    if (!bot) {
      await persistIncoming();
      res.status(200).send('NO_BOT_FOR_OWNER');
      return;
    }

    const b = bot as NonNullable<typeof bot>;

    // Products
    const productDocs: IProduct[] = Array.isArray(b.product) ? (b.product as IProduct[]) : [b.product as IProduct];
    const productIds = productDocs.map((p) => p._id);

    const mapDocToLLMProduct = (p: any): LLMProduct => ({
      id: p.id_external || String(p._id),
      category: p.category || 'Outro',
      name: p.name || '',
      description: p.description || '',
      price: typeof p.price_eur === 'number' ? p.price_eur : (p.price ?? 0),
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
    const fromProducts: LLMProduct[] = allProductsRaw.map(mapDocToLLMProduct);

    // CatalogItems
    const catalogItemsArr = Array.isArray((b as any).catalogItems) ? (b as any).catalogItems : [];
    const catalogItemIds = catalogItemsArr
      .map((ci: any) => (typeof ci === 'string' ? ci : ci?._id))
      .filter(Boolean);

    let catalogItemsRaw: any[] = [];
    if (catalogItemsArr.some((ci: any) => typeof ci === 'string')) {
      catalogItemsRaw = await CatalogItem.find({ _id: { $in: catalogItemIds } }).lean();
    } else {
      catalogItemsRaw = catalogItemsArr as any[];
    }
    const fromCatalog: LLMProduct[] = catalogItemsRaw.map(catalogItemToLLMProduct);

    // MERGE
    const allProducts: LLMProduct[] = [...fromProducts, ...fromCatalog];

    // 🔎 DEBUG
    console.log('[TWILIO] total products:', fromProducts.length);
    console.log('[TWILIO] total catalog items:', fromCatalog.length);
    console.log('[TWILIO] merged allProducts:', allProducts.length);

    // História
    const history: ChatHistoryItem[] = [];
    const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(8).lean();
    lastMsgs.reverse().forEach((m) => {
      history.push({ role: m.sender === 'Bot' ? 'assistant' : 'user', content: m.message || '' });
    });

    // Memória
    let memory: MemoryContext = {};
    const memDoc = await ClientMemory.findOne({ clientId: fromClean }).lean();
    if (memDoc) memory = { topics: memDoc.topicsAgg ?? [], sentiment: memDoc.sentimentAgg ?? 'neutral' };

    // Relevantes
    async function selectRelevantProducts(userText: string): Promise<LLMProduct[]> {
      const textQuery = buildTextSearchQuery(userText);
      let relevantFromProducts: any[] = [];
      if (textQuery) {
        relevantFromProducts = await Product.find({
          _id: { $in: productIds },
          $text: { $search: textQuery },
        })
          .lean()
          .limit(5);
      }
      if (!relevantFromProducts.length) {
        relevantFromProducts = allProductsRaw
          .map((p: any) => ({ ...p, __score: fallbackScore(userText, p.name, p.description) }))
          .sort((a, b) => b.__score - a.__score)
          .slice(0, 5);
      }
      const mappedFromProducts = relevantFromProducts.map(mapDocToLLMProduct);

      const rankedCatalog = fromCatalog
        .map((ci) => ({ ci, __score: fallbackScore(userText, ci.name, ci.description) }))
        .sort((a, b) => b.__score - a.__score)
        .map((x) => x.ci);

      return [...mappedFromProducts, ...rankedCatalog].slice(0, 5);
    }

    async function hasRemainingChars(username: string) {
      const q = await ConversationQuota.findOne({ username }, { totalConversations: 1, usedCharacters: 1 }).lean();
      if (!q || !q.totalConversations) return false;
      const maxChars = q.totalConversations * CHARS_PER_CONVERSATION;
      return (q.usedCharacters || 0) < maxChars;
    }

    // Persist incoming texto
    if (Body) {
      const canReplyNow = await hasRemainingChars(billingUsername);
      if (!canReplyNow) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';

        // ✅ CORRIGIDO: to=From, from=To (ambos whatsapp:)
        await sendMessageToTwilio(aviso, toWp, fromWp);

        await saveMessage(roomId, 'Bot', aviso, true);
        res.status(200).send('Package exhausted');
        return;
      }
      try { await spendCharacters(billingUsername, Body.length || 0); } catch (e) { console.error('[BILLING] debit fail', e); }

      await saveMessage(roomId, sender, Body, true, undefined, undefined, billingUsername);
      io.to(roomId).emit('twilio message', { sender, message: Body });
      io.emit('historicalRoomUpdated', { roomId, lastMessage: Body, lastTimestamp: new Date() });
    }

    // Persist incoming mídia
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

    console.log('[TWILIO] calling OpenAI with:', {
      adapterProducts: adapterProducts.map((p) => ({ id: p.id, name: p.name })),
      allProductsCount: allProducts.length,
    });

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
        allProducts.map((p) => p.name),
        { about: b.about, guidelines: b.guidelines }
      );
    } catch (err) {
      console.error('[TWILIO] OpenAI error:', err);
      resposta = undefined;
    }

    if (resposta) {
      const canStillReply = await (async () => {
        const q = await ConversationQuota.findOne({ username: billingUsername }, { totalConversations: 1, usedCharacters: 1 }).lean();
        if (!q || !q.totalConversations) return false;
        const maxChars = q.totalConversations * CHARS_PER_CONVERSATION;
        return (q.usedCharacters || 0) < maxChars;
      })();

      if (!canStillReply) {
        const aviso = 'Seu pacote de conversas acabou. Compre um novo para continuar. 😊';

        // ✅ CORRIGIDO
        await sendMessageToTwilio(aviso, toWp, fromWp);

        await saveMessage(roomId, 'Bot', aviso, true);
        res.status(200).send('Package exhausted (post-gen)');
        return;
      }

      // ✅ CORRIGIDO: envio WhatsApp sempre no padrão
      console.log('[SEND TWILIO]', { to: toWp, from: fromWp });

      await sendMessageToTwilio(resposta, toWp, fromWp);
      await saveMessage(roomId, 'Bot', resposta, true);
      io.to(roomId).emit('twilio message', { sender: 'Bot', message: resposta });
      io.emit('historicalRoomUpdated', { roomId, lastMessage: resposta, lastTimestamp: new Date() });

      try { await spendCharacters(billingUsername, resposta.length || 0); } catch (e) { console.error('[BILLING] debit fail', e); }
    }

    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
    res.status(200).send('IGNORED_ERROR_TOPLEVEL');
  }
};
