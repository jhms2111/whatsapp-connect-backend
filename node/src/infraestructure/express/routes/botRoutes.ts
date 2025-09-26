// src/api/routes/botRoutes.ts
import { Router, Request, Response } from 'express';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.post('/bot', authenticateJWT, async (req: Request, res: Response) => {
  const {
    persona,
    about,                 // "Quem somos"
    guidelines,            // instruções livres do bot
    temperature,
    product,
    companyName,
    address,
    email,
    phone,
  } = req.body;

  const username = (req as any)?.user?.username;

  if (!username) {
    return res.status(401).json({ error: 'Usuário não autenticado.' });
  }

  try {
    // Impede mais de um bot por owner
    const existingBot = await Bot.findOne({ owner: username });
    if (existingBot) {
      return res.status(400).json({
        error: 'Você já criou um bot. Você pode editar ou excluir o bot existente.',
      });
    }

    // Valida produtos
    if (!Array.isArray(product) || product.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um produto válido.' });
    }

    // Normaliza temperatura (0..1)
    const t = Number(temperature);
    const safeTemp = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;

    const newBot = new Bot({
      name: 'Enki',
      persona: String(persona || '').trim(),
      about: typeof about === 'string' ? about.trim() : undefined,
      guidelines: typeof guidelines === 'string' ? guidelines.trim() : undefined,
      temperature: safeTemp,
      product,
      companyName: typeof companyName === 'string' ? companyName.trim() : undefined,
      address: typeof address === 'string' ? address.trim() : undefined,
      email: typeof email === 'string' ? email.trim() : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      owner: username,
    });

    await newBot.save();

    // (Opcional) popular produtos na resposta
    const saved = await Bot.findById(newBot._id).populate('product');

    return res.status(201).json(saved);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    return res.status(500).json({ error: 'Erro ao criar o bot' });
  }
});

export default router;
