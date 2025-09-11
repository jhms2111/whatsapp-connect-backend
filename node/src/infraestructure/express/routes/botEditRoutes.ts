//botEditRoutes.ts
import { Router, Request, Response } from 'express';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Editar bot (rota separada)
router.put('/bot/edit/:id', authenticateJWT, async (req: Request, res: Response) => {
  const {
    name,
    persona,
    about,         // ✅ novo campo
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
    bot.about = about; // ✅ persiste "Quem somos"
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

export default router;
