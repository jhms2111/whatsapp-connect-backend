//messageRoutes.ts

import { Router } from 'express';
import Bot from '../../mongo/models/botModel';

const router = Router();

// Criar bot
router.post('/bot', async (req, res) => {
  try {
    const { persona, temperature, product, companyName, address, email, phone, owner } = req.body;

    if (!product || !Array.isArray(product) || product.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um produto válido.' });
    }

    const newBot = new Bot({
      name: 'Enki',
      persona,
      temperature,
      product,
      companyName,
      address,
      email,
      phone,
      owner,
    });

    await newBot.save();
    res.status(201).json(newBot);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    res.status(500).json({ error: 'Erro ao criar o bot' });
  }
});

router.put('/bot/:id', async (req, res) => {
  const { name, persona, temperature, product } = req.body;

  try {
    const updated = await Bot.findByIdAndUpdate(
      req.params.id,
      { name, persona, temperature, product },
      { new: true }
    );
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar bot' });
  }
});

router.get('/bots', async (req, res) => {
  try {
    const bots = await Bot.find().populate('product');
    res.status(200).json(bots);
  } catch (error) {
    console.error('Erro ao listar bots:', error);
    res.status(500).json({ error: 'Erro ao listar bots' });
  }
});

export default router;
