// src/api/routes/botRoutes.ts
import { Router } from 'express';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.post('/bot', authenticateJWT, async (req, res) => {
  const {
    persona,
    about,                 // ✅ novo campo "Quem somos"
    temperature,
    product,
    companyName,
    address,
    email,
    phone
  } = req.body;

  const username = (req as any).user.username;

  console.log('Username extraído do token:', username);

  try {
    const existingBot = await Bot.findOne({ owner: username });
    console.log('Bot existente encontrado?', !!existingBot);

    // ✅ impede mais de um bot por owner
    if (existingBot) {
      return res.status(400).json({
        error: 'Você já criou um bot. Você pode editar ou excluir o bot existente.',
      });
    }

    if (!product || !Array.isArray(product) || product.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um produto válido.' });
    }

    const newBot = new Bot({
      name: 'Enki',
      persona,
      about,               // ✅ salva "Quem somos"
      temperature,
      product,
      companyName,
      address,
      email,
      phone,
      owner: username,
    });

    await newBot.save();
    return res.status(201).json(newBot);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    return res.status(500).json({ error: 'Erro ao criar o bot' });
  }
});

export default router;
