// src/routes/chatMessageRoutes.ts
import { Router } from 'express';
import MessageModel from '../../mongo/models/messageModel'; // ajuste o caminho se necessário

const router = Router();

// GET histórico de mensagens por sala
router.get('/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;

  try {
    const messages = await MessageModel.find({ roomId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
});

export default router;
