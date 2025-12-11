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
import { authenticateVisitorJWT, VisitorJwtPayload } from '../middleware/authVisitor';

export type PanelJwtPayload = {
  username: string; // dono do painel
  iat?: number;
  exp?: number;
};

const PANEL_JWT_SECRET = process.env.PANEL_JWT_SECRET || 'panel-secret-change-me';

// JWT do visitante do webchat (nome de acesso)
// ⚠️ Certifique-se de usar o MESMO secret em authenticateVisitorJWT
const VISITOR_JWT_SECRET = process.env.VISITOR_JWT_SECRET || 'visitor-secret-change-me';

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
 * 0) WEBCHAT: login por nome de acesso (público, sem JWT)
 *     - recebe { username, name }
 *     - cria/recupera WebchatVisitor
 *     - devolve visitorToken + roomId
 * =================================================== */
router.post('/webchat/visitor/login-name', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { username?: string; name?: string };
    const username = body.username;
    const name = body.name;

    if (!username || !name) {
      return res.status(400).json({ error: 'username e name são obrigatórios.' });
    }

    const owner = String(username).trim();

    // mesma normalização do front-end
    const normalizedName = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    if (!normalizedName || normalizedName.length < 3) {
      return res.status(400).json({
        error: 'Nome de acesso inválido. Use pelo menos 3 caracteres, sem espaços.',
      });
    }

    // procura visitante desse owner com esse nome (guardado em "email")
    let visitor = await WebchatVisitor.findOne({
      owner: owner,
      email: normalizedName,
    })
      .lean<IWebchatVisitor>()
      .exec();

    // se não existir, cria um novo
    if (!visitor) {
      const roomId = `webchat:${owner}:${normalizedName}`;
      const sessionId = Date.now().toString();

      const created = await WebchatVisitor.create({
        owner: owner,
        email: normalizedName, // aqui você está usando "email" como nome de acesso
        roomId: roomId,
        sessionId: sessionId,
      });

      visitor = created.toObject() as IWebchatVisitor;
    } else if (!visitor.roomId) {
      // garante que roomId segue o padrão esperado, caso já exista o doc antigo
      const roomId = `webchat:${owner}:${normalizedName}`;
      await WebchatVisitor.updateOne(
        { _id: (visitor as any)._id },
        { $set: { roomId: roomId } }
      ).exec();
      visitor.roomId = roomId;
    }

    // monta o payload que o authenticateVisitorJWT espera
    const payload: VisitorJwtPayload = {
      owner: owner,
      sub: normalizedName, // sub = nome de acesso (ex: joao_henrique2111)
    };

    const visitorToken = jwt.sign(payload, VISITOR_JWT_SECRET, {
      expiresIn: '30d',
    });

    return res.json({
      visitorToken: visitorToken,
      roomId: visitor.roomId,
    });
  } catch (error) {
    console.error('[webchat/visitor/login-name] error', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * 1) WEBCHAT: start (visitante autenticado)
 * =================================================== */
router.post('/webchat/start', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as VisitorJwtPayload;
    const visitor = await WebchatVisitor
      .findOne({ owner: payload.owner, email: payload.sub })
      .lean<IWebchatVisitor>()
      .exec();

    if (!visitor) return res.status(404).json({ error: 'Sessão não encontrada.' });

    return res.json({ roomId: visitor.roomId, sessionId: visitor.sessionId });
  } catch (error) {
    console.error('[webchat/start] error', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * 2) WEBCHAT: enviar mensagem + BOT PIPELINE (visitante)
 * =================================================== */
router.post('/webchat/send', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as VisitorJwtPayload; // { owner, sub (nome de acesso) }
    const body = (req.body || {}) as { text?: string };
    const text = body.text;
    const username = payload.owner;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Texto vazio.' });
    }

    // valida sessão do visitante
    const visitor = await WebchatVisitor
      .findOne({ owner: username, email: payload.sub })
      .lean<IWebchatVisitor>()
      .exec();

    if (!visitor) return res.status(404).json({ error: 'Sessão não encontrada.' });

    const roomId = visitor.roomId;

    // 🔒 Se os bots estiverem pausados/bloqueados para este owner,
    //     apenas salve/propague a mensagem e NÃO gere resposta automática.
    const autoReplyAllowed = await canAutoReplyOwner(username);
    if (!autoReplyAllowed) {
      await Message.create({
        roomId: roomId,
        sender: payload.sub,  // identificador do visitante (nome de acesso)
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
            roomId: roomId,
            lastMessage: text,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId: roomId,
            sender: payload.sub,
            message: String(text),
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch (error) {
        console.error('[webchat/send] notify (autoReply off) error', error);
      }

      return res.json({ ok: true, reply: '' });
    }

    // (1) QUOTA WEBCHAT do proprietário (somente quando auto-reply está ativo)
    const quota = await WebchatQuota
      .findOne({ username: username }, { totalConversations: 1, usedCharacters: 1 })
      .lean<IWebchatQuota | null>();

    const maxChars = (quota?.totalConversations || 0) * CHARS_PER_CONV;
    if (!quota || !quota.totalConversations || (quota.usedCharacters || 0) >= maxChars) {
      // mesmo sem crédito, salvamos a entrada do visitante e notificamos o painel
      await Message.create({
        roomId: roomId,
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
            roomId: roomId,
            lastMessage: text,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId: roomId,
            sender: payload.sub,
            message: String(text),
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch (error) {
        console.error('[webchat/send] notify (no credits) error', error);
      }
      return res.status(402).json({ error: 'Créditos (WebChat) esgotados' });
    }

    // (2) salva entrada do visitante (auto-reply permitido)
    await Message.create({
      roomId: roomId,
      sender: payload.sub,  // identificador do visitante (nome de acesso)
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
          roomId: roomId,
          lastMessage: text,
          lastTimestamp: new Date().toISOString(),
          channel: 'webchat',
        });
        io.to(roomId).emit('webchat message', {
          roomId: roomId,
          sender: payload.sub,
          message: String(text),
          timestamp: new Date().toISOString(),
          channel: 'webchat',
          sent: true,
        });
      }
    } catch (error) {
      console.error('[webchat/send] notify error', error);
    }

    // (3) memória (opcional)
    let memoryContext: MemoryContext = {};
    try {
      // IMPORTANTE: aqui o clientId passa a ser o nome de acesso (payload.sub)
      const memoryDocument = await ClientMemory.findOne({ clientId: payload.sub }).lean();
      if (memoryDocument) {
        memoryContext = {
          topics: (memoryDocument as any).topicsAgg ?? [],
          sentiment: (memoryDocument as any).sentimentAgg ?? 'neutral',
        };
      }
    } catch (error) {
      console.error('[webchat/send] memory error', error);
    }

    // (4) carrega bot e produtos do proprietário
    const bot = await Bot.findOne({ owner: username }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const productDocs: IProduct[] = Array.isArray((bot as any).product)
      ? ((bot as any).product as IProduct[])
      : [((bot as any).product as IProduct)].filter(Boolean);

    const allProductsRaw = await Product.find({ _id: { $in: productDocs.map(product => product._id) } }).lean();
    const allProducts = allProductsRaw.map(mapDoc);

    // (5) histórico curto (últimos 6)
    const lastMessages = await Message.find({ roomId: roomId }).sort({ timestamp: -1 }).limit(6).lean();
    const history: ChatHistoryItem[] = lastMessages.reverse().map(message => ({
      role: message.sender === 'Bot' ? 'assistant' : 'user',
      content: message.message || '',
    }));

    // (6) relevantes + debita entrada
    const relevantProducts = await pickRelevant(productDocs.map(product => product._id), String(text));
    try {
      await spendWebchatCharacters(username, String(text).length);
    } catch (error) {
      console.error('[webchat/send] spendWebchatCharacters (input) error', error);
    }

    // (7) IA
    const reply = await generateBotResponse(
      (bot as any).name ?? 'Enki',
      (bot as any).persona ?? 'simpática',
      relevantProducts,
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
      memoryContext,
      { userInputLanguage: detectLang(String(text)) },
      productDocs.map(product => product.name),
      { about: (bot as any).about, guidelines: (bot as any).guidelines }
    );

    // (8) salva resposta + debita saída + notifica
    if (reply) {
      await Message.create({
        roomId: roomId,
        sender: 'Bot',
        message: reply,
        sent: true,
        timestamp: new Date(),
        to: username,
        channel: 'webchat',
      });
      try {
        await spendWebchatCharacters(username, reply.length);
      } catch (error) {
        console.error('[webchat/send] spendWebchatCharacters (output) error', error);
      }

      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('historicalRoomUpdated', {
            roomId: roomId,
            lastMessage: reply,
            lastTimestamp: new Date().toISOString(),
            channel: 'webchat',
          });
          io.to(roomId).emit('webchat message', {
            roomId: roomId,
            sender: 'Bot',
            message: reply,
            timestamp: new Date().toISOString(),
            channel: 'webchat',
            sent: true,
          });
        }
      } catch (error) {
        console.error('[webchat/send] notify bot reply error', error);
      }
    }

    return res.json({ ok: true, reply: reply || '' });
  } catch (error: any) {
    console.error('[webchat/send] error', error?.errors || error);
    return res.status(500).json({ error: error?.message || 'Erro interno.' });
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
    const roomIdParam = req.params.roomId;

    const expectedRoomId = `webchat:${payload.owner}:${payload.sub}`;
    if (roomIdParam !== expectedRoomId) {
      return res.status(403).json({ error: 'Você não tem permissão para esta sala.' });
    }

    const messages = await Message
      .find({
        roomId: expectedRoomId,
        sender: { $ne: 'system' },
        message: { $ne: 'webchat_started' },
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return res.json(Array.isArray(messages) ? messages : []);
  } catch (error) {
    console.error('[webchat/messages] error', error);
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
    const roomIdParam = req.params.roomId;
    const payload = (req as any).panel as PanelJwtPayload; // { username }
    const prefix = `webchat:${payload.username}:`;

    if (!roomIdParam.startsWith(prefix)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta sala.' });
    }

    const messages = await Message
      .find({
        roomId: roomIdParam,
        sender: { $ne: 'system' },
        message: { $ne: 'webchat_started' },
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return res.json(Array.isArray(messages) ? messages : []);
  } catch (error) {
    console.error('[admin/webchat/messages] error', error);
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
    const lastMessages = await Message.find({
      roomId: { $regex: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`) },
      sender: { $ne: 'system' },
      message: { $ne: 'webchat_started' },
    })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean()
      .exec();

    const map = new Map<string, { _id: string; lastMessage: string; lastTimestamp: string }>();

    for (const message of lastMessages) {
      if (!message?.roomId) continue;
      if (!map.has(message.roomId)) {
        const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp || Date.now());
        map.set(message.roomId, {
          _id: message.roomId,
          lastMessage: message.message || '',
          lastTimestamp: timestamp.toISOString(),
        });
      }
    }

    // complementa com visitantes do owner
    const visitors = await WebchatVisitor.find({ owner: payload.username })
      .lean<IWebchatVisitor[]>()
      .exec();

    for (const visitor of visitors || []) {
      if (!visitor?.roomId?.startsWith(prefix)) continue;
      if (!map.has(visitor.roomId)) {
        const tsRaw: any = (visitor as any).updatedAt || (visitor as any).verifiedAt || (visitor as any).createdAt || new Date(0);
        const ts = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
        map.set(visitor.roomId, {
          _id: visitor.roomId,
          lastMessage: '',
          lastTimestamp: ts.toISOString(),
        });
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    );

    return res.json(list);
  } catch (error) {
    console.error('[admin/webchat/historical-rooms] error', error);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

/* ===================================================
 * ⚠️ REMOVIDO: rotas duplicadas de /webchat/bots/global-status
 *   (as que faziam updateMany em todos os clientes).
 *   A versão correta (por usuário) está no router separado abaixo.
 * =================================================== */

export default router;
