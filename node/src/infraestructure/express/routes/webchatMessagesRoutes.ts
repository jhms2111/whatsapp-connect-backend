// server/routes/webchatMessagesRoutes.ts
import { Router, Request, Response } from 'express';
import Message from '../../mongo/models/messageModel';

const router = Router();

/** Extrai partes do roomId "webchat:<owner>:<sessionId>" */
function parseWebchatRoomId(roomIdRaw: string) {
  const roomId = String(roomIdRaw || '');
  const [prefix, owner, session] = roomId.split(':');
  return { prefix, owner, session, roomId };
}

/** Checa se o usuário autenticado pode ler este roomId (escopo WebChat) */
function ensureWebchatReadAccess(req: Request, roomId: string) {
  const { prefix, owner } = parseWebchatRoomId(roomId);
  const loggedUser = (req as any)?.user?.username;

  if (!loggedUser) {
    return { ok: false, status: 401, error: 'Não autenticado' };
  }

  // Se for webchat, apenas o dono pode ler
  if (prefix === 'webchat') {
    if (loggedUser !== owner) {
      return { ok: false, status: 403, error: 'Proibido: você não é o dono desta conversa' };
    }
  }

  // Caso no futuro existam outros canais, você pode extender aqui.
  return { ok: true as const, status: 200, error: null as null };
}

/**
 * GET /api/webchat/messages/:roomId
 * Lê as mensagens de um roomId específico (ordenadas por timestamp asc)
 */
router.get('/webchat/messages/:roomId', async (req: Request, res: Response) => {
  try {
    // Express já decodifica %3A -> :
    const roomId = req.params.roomId;
    if (!roomId) return res.status(400).json({ error: 'roomId é obrigatório' });

    const auth = ensureWebchatReadAccess(req, roomId);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const docs = await Message.find({ roomId }).sort({ timestamp: 1 }).lean();
    return res.json(docs || []);
  } catch (e) {
    console.error('[webchat/messages/:roomId] erro:', e);
    return res.status(500).json({ error: 'Falha ao obter mensagens' });
  }
});

/**
 * GET /api/webchat/messages?roomId=...
 * Variante por query string (útil se preferir evitar ":" no path do front)
 */
router.get('/webchat/messages', async (req: Request, res: Response) => {
  try {
    const roomId = String(req.query.roomId || '');
    if (!roomId) return res.status(400).json({ error: 'roomId é obrigatório' });

    const auth = ensureWebchatReadAccess(req, roomId);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const docs = await Message.find({ roomId }).sort({ timestamp: 1 }).lean();
    return res.json(docs || []);
  } catch (e) {
    console.error('[webchat/messages] erro:', e);
    return res.status(500).json({ error: 'Falha ao obter mensagens' });
  }
});

export default router;


