//botDeleteRoutes.ts
import { Router, Request, Response } from 'express';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Excluir bot (rota separada)
router.delete('/bot/delete/:id', authenticateJWT, async (req: Request, res: Response) => {
  const botId = req.params.id;

  try {
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado.' });
    }

    await Bot.findByIdAndDelete(botId);
    res.status(200).json({ message: 'Bot excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir bot:', error);
    res.status(500).json({ error: 'Erro ao excluir o bot' });
  }
});

export default router;
