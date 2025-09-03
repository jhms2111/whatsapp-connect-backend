import { Router, Request, Response } from 'express'; // Importando Router, Request e Response
import Bot from '../../mongo/models/botModel'; // Importando o modelo Bot
import { authenticateJWT } from '../middleware/authMiddleware'; // Importando o middleware de autenticação

const router = Router(); // Criando uma instância do Router

// Excluir bot (rota separada)
router.delete('/bot/delete/:id', authenticateJWT, async (req: Request, res: Response) => {
  const botId = req.params.id; // Pegando o id do bot da URL

  try {
    // Verifica se o bot existe
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado.' });
    }

    // Exclui o bot
    await Bot.findByIdAndDelete(botId);
    res.status(200).json({ message: 'Bot excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir bot:', error);
    res.status(500).json({ error: 'Erro ao excluir o bot' });
  }
});

export default router; // Exportando o router
