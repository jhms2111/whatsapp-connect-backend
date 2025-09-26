import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Excluir bot (rota separada)
router.delete('/bot/delete/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID do bot inválido.' });
    }

    const authUser = (req as any).user as { username?: string };
    if (!authUser?.username) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const bot = await Bot.findById(id);
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado.' });
    }

    if (bot.owner !== authUser.username) {
      return res.status(403).json({ error: 'Acesso não autorizado.' });
    }

    await Bot.findByIdAndDelete(id);
    return res.status(200).json({ message: 'Bot excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir bot:', error);
    return res.status(500).json({ error: 'Erro ao excluir o bot' });
  }
});

export default router;
