// src/infraestructure/express/routes/whatsappWebhook.ts
import { Router } from 'express';
import User from '../../mongo/models/userModel';

const router = Router();

router.post('/webhook/whatsapp', async (req, res) => {
  // Descubra o username dono do número/instância
  const ownerUsername = /* sua lógica de mapeamento */ '';

  const u = await User.findOne({ username: ownerUsername }, { status: 1 }).lean();
  if (!u || u.status === 'blocked') {
    return res.status(200).send('IGNORED_BLOCKED_USER'); // não processa, evita reentrega
  }

  // … fluxo normal
  return res.status(200).send('OK');
});

export default router;
