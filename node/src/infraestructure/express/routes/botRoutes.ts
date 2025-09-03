import { Router } from 'express';
import Bot from '../../mongo/models/botModel';
import { authenticateJWT } from '../middleware/authMiddleware';


const router = Router();

router.post('/bot', authenticateJWT, async (req, res) => {
  const { persona, temperature, product, companyName, address, email, phone } = req.body;
  const username = (req as any).user.username;

  console.log('Username extraído do token:', username);

  const existingBot = await Bot.findOne({ owner: username });
  console.log('Bot existente encontrado?', existingBot);

  // ✅ VERIFICAÇÃO FALTANDO!
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
    temperature,
    product,
    companyName,
    address,
    email,
    phone,
    owner: username,
  });

  try {
    await newBot.save();
    res.status(201).json(newBot);
  } catch (error) {
    console.error('Erro ao criar bot:', error);
    res.status(500).json({ error: 'Erro ao criar o bot' });
  }
});




export default router;