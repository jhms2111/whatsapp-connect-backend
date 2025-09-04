// src/infraestructure/express/routes/adminTwilioNumberRoutes.ts
import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.post('/admin/twilio-number', authenticateJWT, async (req: Request, res: Response) => {
  const { username, number } = req.body;
  const requester = (req as any).user;

  if (requester.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem cadastrar números.' });
  }

  try {
    const existing = await TwilioNumber.findOne({ number });
    if (existing) {
      return res.status(409).json({ error: 'Número já cadastrado por outro cliente.' });
    }

    const newNumber = new TwilioNumber({
      owner: username,
      number,
    });

    await newNumber.save();
    res.status(201).json({ message: 'Número cadastrado pelo admin com sucesso!', data: newNumber });
  } catch (error) {
    console.error('Erro ao cadastrar número Twilio pelo admin:', error);
    res.status(500).json({ error: 'Erro ao cadastrar número' });
  }
});

export default router;
