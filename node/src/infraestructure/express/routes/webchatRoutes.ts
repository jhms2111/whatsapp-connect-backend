import { Router, Request, Response } from 'express';

import Message from '../../mongo/models/messageModel';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';
import Cliente from '../../mongo/models/clienteModel';
import Bot from '../../mongo/models/botModel';
import Product, { IProduct } from '../../mongo/models/productModel';
import ClientMemory from '../../mongo/models/clientMemoryModel';

// Quota WebChat
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { spendWebchatCharacters } from '../../../modules/billing/webchatUsage';

// IA & helpers
import {
  generateBotResponse,
  detectLang,
  Product as LLMProduct,
  ChatHistoryItem,
  MemoryContext,
} from '../../../modules/integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery } from '../../../utils/search';

// 🔒 Guard do owner (usa botsEnabled/status com cache)
import { canAutoReplyOwner } from '../../../infraestructure/express/helpers/botGuard';

// ====== MIDDLEWARE DO PAINEL INLINE (para evitar erro de import) ======
import jwt from 'jsonwebtoken';

export type PanelJwtPayload = {
  username: string; // dono do painel
  iat?: number;
  exp?: number;
};

const PANEL_JWT_SECRET = process.env.PANEL_JWT_SECRET || 'panel-secret-change-me';

export function authenticatePanelJWT(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, PANEL_JWT_SECRET) as PanelJwtPayload;
    if (!payload?.username) return res.status(401).json({ error: 'Unauthorized' });
    (req as any).panel = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
// ======================================================================

const router = Router();
const CHARS_PER_CONV = 500;

/* ----------------------- Utils ----------------------- */
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

/* ===================================================
 * 1) WEBCHAT: start (visitante autenticado)
 * =================================================== */
import { authenticateVisitorJWT, VisitorJwtPayload } from '../middleware/authVisitor';

router.post('/webchat/start', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as VisitorJwtPayload;
    const v = await WebchatVisitor
      .findOne({ owner: payload.owner, phoneE164: payload.sub })
      .lean<IWebchatVisitor>()
      .exec();

    if (!v) return res.status(404).json({ error: 'Sessão não encontrada.' });

    return res.json({ roomId: v.roomId, sessionId: v.sessionId });
  } catch (e) {
    console.error('[webchat/start] error', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * 2) WEBCHAT: enviar mensagem + BOT PIPELINE (visitante)
 * =================================================== */
router.post('/webchat/send', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as VisitorJwtPayload; // { owner, sub (phoneE164) }
    const { text } = (req.body || {}) as { text?: string };
    const username = payload.owner;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Texto vazio.' });
    }

    // valida sessão do visitante
    const v = await WebchatVisitor
      .findOne({ owner: username, phoneE164: payload.sub })
      .lean<IWebchatVisitor>()
      .exec();
    if (!v) return res.status(404).json({ error: 'Sessão não encontrada.' });

    const roomId = v.roomId;

    // 🔒 Se os bots estiverem pausados/bloqueados para este owner,
    //     apenas salve/propague a mensagem e NÃO gere resposta automática.
    const autoReplyAllowed = await canAutoReplyOwner(username);
    if (!autoReplyAllowed) {
      await Message.create({
        roomId,
        sender: payload.sub,  // telefone do visitante
        message: String(text),
        sent: true,
        timestamp: new Date(),
        to: username,
        channel: 'webchat',
      });

      // notifica painel/histórico em tempo real (sem resposta automática)
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('historicalRoomUpdated', {
            roomId,
            lastMessage: text,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId,
            sender: payload.sub,
            message: String(text),
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch {}

      return res.json({ ok: true, reply: '' });
    }

    // (1) QUOTA WEBCHAT do proprietário (somente quando auto-reply está ativo)
    const q = await WebchatQuota
      .findOne({ username }, { totalConversations: 1, usedCharacters: 1 })
      .lean<IWebchatQuota | null>();

    const maxChars = (q?.totalConversations || 0) * CHARS_PER_CONV;
    if (!q || !q.totalConversations || (q.usedCharacters || 0) >= maxChars) {
      // mesmo sem crédito, salvamos a entrada do visitante e notificamos o painel
      await Message.create({
        roomId,
        sender: payload.sub,
        message: String(text),
        sent: true,
        timestamp: new Date(),
        to: username,
        channel: 'webchat',
      });
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('historicalRoomUpdated', {
            roomId,
            lastMessage: text,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId,
            sender: payload.sub,
            message: String(text),
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch {}
      return res.status(402).json({ error: 'Créditos (WebChat) esgotados' });
    }

    // (2) salva entrada do visitante (auto-reply permitido)
    await Message.create({
      roomId,
      sender: payload.sub,  // telefone do visitante
      message: String(text),
      sent: true,
      timestamp: new Date(),
      to: username,
      channel: 'webchat',
    });

    // (2.1) notifica painel/histórico
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('historicalRoomUpdated', {
          roomId,
          lastMessage: text,
          lastTimestamp: new Date().toISOString(),
          channel: 'webchat',
        });
        io.to(roomId).emit('webchat message', {
          roomId,
          sender: payload.sub,
          message: String(text),
          timestamp: new Date().toISOString(),
          channel: 'webchat',
          sent: true,
        });
      }
    } catch {}

    // (3) memória (opcional)
    let memory: MemoryContext = {};
    try {
      const mem = await ClientMemory.findOne({ clientId: payload.sub }).lean();
      if (mem) memory = { topics: (mem as any).topicsAgg ?? [], sentiment: (mem as any).sentimentAgg ?? 'neutral' };
    } catch {}

    // (4) carrega bot e produtos do proprietário
    const bot = await Bot.findOne({ owner: username }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const productDocs: IProduct[] = Array.isArray((bot as any).product)
      ? ((bot as any).product as IProduct[])
      : [((bot as any).product as IProduct)].filter(Boolean);

    const allProductsRaw = await Product.find({ _id: { $in: productDocs.map(p => p._id) } }).lean();
    const allProducts = allProductsRaw.map(mapDoc);

    // (5) histórico curto (últimos 6)
    const last = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(6).lean();
    const history: ChatHistoryItem[] = last.reverse().map(m => ({
      role: m.sender === 'Bot' ? 'assistant' : 'user',
      content: m.message || '',
    }));

    // (6) relevantes + debita entrada
    const relevant = await pickRelevant(productDocs.map(p => p._id), String(text));
    try { await spendWebchatCharacters(username, String(text).length); } catch {}

    // (7) IA
    const reply = await generateBotResponse(
      (bot as any).name ?? 'Enki',
      (bot as any).persona ?? 'simpática',
      relevant,
      allProducts,
      (bot as any).temperature ?? 0.5,
      String(text),
      {
        name: (bot as any).companyName ?? 'Empresa',
        address: (bot as any).address ?? 'Endereço',
        email: (bot as any).email ?? 'email@empresa.com',
        phone: (bot as any).phone ?? '(00) 00000-0000',
      },
      history,
      memory,
      { userInputLanguage: detectLang(String(text)) },
      productDocs.map((p) => p.name),
      { about: (bot as any).about, guidelines: (bot as any).guidelines }
    );

    // (8) salva resposta + debita saída + notifica
    if (reply) {
      await Message.create({
        roomId,
        sender: 'Bot',
        message: reply,
        sent: true,
        timestamp: new Date(),
        to: username,
        channel: 'webchat',
      });
      try { await spendWebchatCharacters(username, reply.length); } catch {}

      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('historicalRoomUpdated', {
            roomId,
            lastMessage: reply,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId,
            sender: 'Bot',
            message: reply,
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch {}
    }

    return res.json({ ok: true, reply: reply || '' });
  } catch (e: any) {
    console.error('[webchat/send] error', e?.errors || e);
    return res.status(500).json({ error: e?.message || 'Erro interno.' });
  }
});

/* ===================================================
 * 3) WEBCHAT: listar mensagens (VISITANTE)
 *     - exige JWT de visitante
 *     - valida roomId exatamente do visitante
 *     - filtra mensagens de sistema
 * =================================================== */
router.get('/webchat/messages/:roomId', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as VisitorJwtPayload;
    const { roomId } = req.params;

    const expectedRoomId = `webchat:${payload.owner}:${payload.sub}`;
    if (roomId !== expectedRoomId) {
      return res.status(403).json({ error: 'Você não tem permissão para esta sala.' });
    }

    const msgs = await Message
      .find({
        roomId: expectedRoomId,
        sender: { $ne: 'system' },
        message: { $ne: 'webchat_started' },
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return res.json(Array.isArray(msgs) ? msgs : []);
  } catch (e) {
    console.error('[webchat/messages] error', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * 4) ADMIN/PAINEL: listar mensagens de UMA sala do próprio owner
 *     - exige JWT do painel
 *     - garante prefixo do roomId = webchat:<username>:
 *     - filtra mensagens de sistema
 * =================================================== */
router.get('/admin/webchat/messages/:roomId', authenticatePanelJWT, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const payload = (req as any).panel as PanelJwtPayload; // { username }
    const prefix = `webchat:${payload.username}:`;

    if (!roomId.startsWith(prefix)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta sala.' });
    }

    const msgs = await Message
      .find({
        roomId,
        sender: { $ne: 'system' },
        message: { $ne: 'webchat_started' },
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return res.json(Array.isArray(msgs) ? msgs : []);
  } catch (e) {
    console.error('[admin/webchat/messages] error', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * 5) ADMIN/PAINEL: histórico de salas SOMENTE do owner logado
 *     - exige JWT do painel
 *     - junta última mensagem + salas sem mensagem (via WebchatVisitor)
 * =================================================== */
router.get('/admin/webchat/historical-rooms', authenticatePanelJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).panel as PanelJwtPayload; // { username }
    const prefix = `webchat:${payload.username}:`;

    // últimas mensagens (ignorando sistema) apenas do owner
    const lastMsgs = await Message.find({
      roomId: { $regex: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`) },
      sender: { $ne: 'system' },
      message: { $ne: 'webchat_started' },
    })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean()
      .exec();

    const map = new Map<string, { _id: string; lastMessage: string; lastTimestamp: string }>();
    for (const m of lastMsgs) {
      if (!m?.roomId) continue;
      if (!map.has(m.roomId)) {
        const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp || Date.now());
        map.set(m.roomId, {
          _id: m.roomId,
          lastMessage: m.message || '',
          lastTimestamp: ts.toISOString(),
        });
      }
    }

    // complementa com visitantes do owner
    const visitors = await WebchatVisitor.find({ owner: payload.username })
      .lean<IWebchatVisitor[]>()
      .exec();

    for (const v of visitors || []) {
      if (!v?.roomId?.startsWith(prefix)) continue;
      if (!map.has(v.roomId)) {
        const ts: any = (v as any).updatedAt || (v as any).verifiedAt || (v as any).createdAt || new Date(0);
        map.set(v.roomId, {
          _id: v.roomId,
          lastMessage: '',
          lastTimestamp: (ts instanceof Date ? ts : new Date(ts)).toISOString(),
        });
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    );

    return res.json(list);
  } catch (e) {
    console.error('[admin/webchat/historical-rooms] error', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * ⚠️ REMOVIDO: rotas duplicadas de /webchat/bots/global-status
 *   (as que faziam updateMany em todos os clientes).
 *   A versão correta (por usuário) está no router separado abaixo.
 * =================================================== */

export default router;