// routes/historyRoutes.ts
import { Router } from 'express';
import Message from '../../mongo/models/messageModel';

const router = Router();

router.get('/historical-rooms', async (req, res) => {
  try {
    const lastMessages = await Message.aggregate([
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$message' },
          lastTimestamp: { $first: '$timestamp' }
        }
      },
      {
        $sort: { lastTimestamp: -1 }
      }
    ]);

    res.status(200).json(lastMessages);
  } catch (error) {
    console.error('Erro ao buscar histórico de salas:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de salas' });
  }
});

export default router;
