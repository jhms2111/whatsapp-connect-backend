import { Router, Request, Response } from 'express';
import crypto from 'crypto';

import Cliente from '../../mongo/models/clienteModel';
import Bot from '../../mongo/models/botModel';
import Product, { IProduct } from '../../mongo/models/productModel';
import Message from '../../mongo/models/messageModel';
import ClientMemory from '../../mongo/models/clientMemoryModel';

// 🔹 QUOTA EXCLUSIVA WEBCHAT
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';

// 🔹 ABATE DE CARACTERES EXCLUSIVO WEBCHAT
import { spendWebchatCharacters } from '../../../modules/billing/webchatUsage';

import {
  generateBotResponse,
  detectLang,
  Product as LLMProduct,
  ChatHistoryItem,
  MemoryContext,
} from '../../../modules/integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery } from '../../../utils/search';

const router = Router();
const CHARS_PER_CONV = 500;

// roomId padrão para webchat
function wcRoom(owner: string, sessionId: string) {
  return `webchat:${owner}:${sessionId}`;
}

async function getOwnerFlags(username: string) {
  const cli = await Cliente.findOne({ username }, { status: 1, botsEnabled: 1 }).lean();
  const blocked = ((cli as any)?.status ?? 'active') === 'blocked';
  const botsEnabled = typeof (cli as any)?.botsEnabled === 'boolean' ? (cli as any)?.botsEnabled : true;
  return { blocked, botsEnabled };
}

function mapDoc(p: any): LLMProduct {
  return {
    id: p.id_external || String(p._id),
    category: p.category || 'Outro',
    name: p.name || '',
    description: p.description || '',
    price: typeof p.price_eur === 'number' ? p.price_eur : (typeof p.price === 'number' ? p.price : 0),
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
  };
}

async function pickRelevant(productIds: any[], userText: string): Promise<LLMProduct[]> {
  const textQuery = buildTextSearchQuery(userText);
  let relevantRaw = await Product.find({
    _id: { $in: productIds },
    ...(textQuery ? { $text: { $search: textQuery } } : {}),
  })
    .limit(5)
    .lean();

  if (!relevantRaw.length) {
    relevantRaw = await Product.find({ _id: { $in: productIds } }).limit(3).lean();
  }
  return relevantRaw.map(mapDoc);
}

/**
 * POST /api/webchat/start
 * body: { username: string, sessionId?: string, clientId?: string }
 */
router.post('/webchat/start', async (req: Request, res: Response) => {
  try {
    const { username, sessionId: incomingSessionId, clientId } = req.body as {
      username?: string; sessionId?: string; clientId?: string;
    };
    if (!username) return res.status(400).json({ error: 'username é obrigatório' });

    const { blocked, botsEnabled } = await getOwnerFlags(username);
    if (blocked) return res.status(423).json({ error: 'Conta do proprietário está bloqueada' });
    if (!botsEnabled) return res.status(403).json({ error: 'Bots desativados pelo proprietário' });

    // checa se existe bot
    const bot = await Bot.findOne({ owner: username }).lean();
    if (!bot) return res.status(404).json({ error: 'Nenhum bot encontrado para esse usuário' });

    const sessionId = incomingSessionId || crypto.randomBytes(16).toString('hex');
    const roomId = wcRoom(username, sessionId);

    await Message.create({
      roomId,
      sender: 'system',
      message: 'webchat_started',
      sent: true,
      timestamp: new Date(),
      to: username,
    });

    if (clientId) {
      await ClientMemory.updateOne(
        { clientId },
        { $setOnInsert: { clientId }, $set: { lastInteraction: new Date() } },
        { upsert: true }
      );
    }

    return res.json({ sessionId, roomId });
  } catch (e) {
    console.error('[WEBCHAT] /start error:', e);
    return res.status(500).json({ error: 'Erro ao iniciar chat' });
  }
});

/**
 * POST /api/webchat/send
 * body: { username: string, sessionId: string, text: string, clientId?: string }
 */
router.post('/webchat/send', async (req: Request, res: Response) => {
  try {
    const { username, sessionId, text, clientId } = req.body as {
      username?: string; sessionId?: string; text?: string; clientId?: string;
    };
    if (!username || !sessionId || !text) {
      return res.status(400).json({ error: 'username, sessionId e text são obrigatórios' });
    }

    const roomId = wcRoom(username, sessionId);

    // flags
    const { blocked, botsEnabled } = await getOwnerFlags(username);
    if (blocked) return res.status(423).json({ error: 'Conta do proprietário está bloqueada' });
    if (!botsEnabled) return res.status(403).json({ error: 'Bots desativados pelo proprietário' });

    // 🔹 quota (WEBCHAT)
    const q = await WebchatQuota
      .findOne({ username }, { totalConversations: 1, usedCharacters: 1 })
      .lean<IWebchatQuota | null>();

    const maxChars = (q?.totalConversations || 0) * CHARS_PER_CONV;
    if (!q || !q.totalConversations || (q.usedCharacters || 0) >= maxChars) {
      return res.status(402).json({ error: 'Créditos (WebChat) esgotados' });
    }

    // salva entrada do cliente
    await Message.create({
      roomId,
      sender: 'client',
      message: text,
      sent: true,
      timestamp: new Date(),
      to: username,
    });

    if (clientId) {
      await ClientMemory.updateOne(
        { clientId },
        { $set: { lastInteraction: new Date() } },
        { upsert: true }
      );
    }

    // carrega bot/produtos
    const bot = await Bot.findOne({ owner: username }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const productDocs: IProduct[] = Array.isArray((bot as any).product)
      ? ((bot as any).product as IProduct[])
      : [((bot as any).product as IProduct)];

    const allProductsRaw = await Product.find({ _id: { $in: productDocs.map(p => p._id) } }).lean();
    const allProducts = allProductsRaw.map(mapDoc);

    // histórico curto (últimos 6)
    const last = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(6).lean();
    const history: ChatHistoryItem[] = last.reverse().map(m => ({
      role: m.sender === 'Bot' ? 'assistant' : 'user',
      content: m.message || '',
    }));

    // memória agregada
    let memory: MemoryContext = {};
    if (clientId) {
      const mem = await ClientMemory.findOne({ clientId }).lean();
      if (mem) memory = { topics: (mem as any).topicsAgg ?? [], sentiment: (mem as any).sentimentAgg ?? 'neutral' };
    }

    const relevant = await pickRelevant(productDocs.map(p => p._id), text);

    // debita caracteres do input (WEBCHAT)
    try { await spendWebchatCharacters(username, text.length); } catch {}

    // chama IA
    const reply = await generateBotResponse(
      (bot as any).name ?? 'Enki',
      (bot as any).persona ?? 'simpática',
      relevant,
      allProducts,
      (bot as any).temperature ?? 0.5,
      text,
      {
        name: (bot as any).companyName ?? 'Empresa',
        address: (bot as any).address ?? 'Endereço',
        email: (bot as any).email ?? 'email@empresa.com',
        phone: (bot as any).phone ?? '(00) 00000-0000',
      },
      history,
      memory,
      { userInputLanguage: detectLang(text) },
      productDocs.map((p) => p.name),
      { about: (bot as any).about, guidelines: (bot as any).guidelines }
    );

    // salva resposta do bot + abate saída (WEBCHAT)
    if (reply) {
      await Message.create({
        roomId,
        sender: 'Bot',
        message: reply,
        sent: true,
        timestamp: new Date(),
        to: username,
      });
      try { await spendWebchatCharacters(username, reply.length); } catch {}
    }

    return res.json({ reply: reply || '' });
  } catch (e) {
    console.error('[WEBCHAT] /send error:', e);
    return res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

export default router;
