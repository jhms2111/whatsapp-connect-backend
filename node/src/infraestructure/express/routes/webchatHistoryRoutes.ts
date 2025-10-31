import { Router, Request, Response } from 'express';
import Message from '../../mongo/models/messageModel';

const router = Router();

/**
 * GET /api/webchat/historical-rooms
 * Retorna, para o usuário autenticado (req.user.username),
 * as salas webchat:<owner>:<session> com última mensagem e último horário.
 */
router.get('/webchat/historical-rooms', async (req: Request, res: Response) => {
  try {
    const u = (req as any)?.user?.username;
    if (!u) return res.status(401).json({ error: 'Auth ausente' });

    // roomId: webchat:<owner>:<sessionId>
    const prefix = `webchat:${u}:`;

    const rows = await Message.aggregate([
      { $match: { roomId: { $regex: `^${prefix}` } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$message' },
          lastTimestamp: { $first: '$timestamp' },
        },
      },
      { $sort: { lastTimestamp: -1 } },
      { $limit: 300 }, // limite de segurança
    ]);

    return res.json(rows);
  } catch (e) {
    console.error('[webchat historical-rooms] erro:', e);
    return res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

export default router;
