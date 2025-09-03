import { Router, Request, Response } from 'express'; // Importando Router, Request e Response
import Bot from '../../mongo/models/botModel'; // Importando o modelo Bot
import { authenticateJWT } from '../middleware/authMiddleware'; // Importando o middleware de autenticação

const router = Router(); // Criando uma instância do Router

// Editar bot (rota separada)
router.put('/bot/edit/:id', authenticateJWT, async (req: Request, res: Response) => {
  const {
    name,
    persona,
    temperature,
    product,
    companyName,
    address,
    email,
    phone,
  } = req.body;

  const botId = req.params.id;

  try {
    const bot = await Bot.findById(botId);
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado.' });

    bot.name = name;
    bot.persona = persona;
    bot.temperature = temperature;
    bot.product = Array.isArray(product) ? product : [product];
    bot.companyName = companyName;
    bot.address = address;
    bot.email = email;
    bot.phone = phone;

    await bot.save();

    res.status(200).json(bot);
  } catch (error) {
    console.error('Erro ao atualizar bot:', error);
    res.status(500).json({ error: 'Erro ao atualizar o bot' });
  }
});


export default router; // Exportando o router
