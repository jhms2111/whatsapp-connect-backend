import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

/**
 * IMPORTANTE:
 * - ESTE router é montado em setupRoutes.ts com: app.use('/api', twilioNumberRoutes)
 * - Portanto, os endpoints finais ficam: /api/twilio-number (GET/POST)
 */

// Cadastrar novo número Twilio
router.post('/twilio-number', authenticateJWT, async (req: Request, res: Response) => {
  const { number, accountSid, authToken } = req.body;
  const username = (req as any).user?.username;

  if (!username) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  try {
    const existing = await TwilioNumber.findOne({ number });
    if (existing) {
      return res.status(409).json({ error: 'Número já cadastrado por outro cliente.' });
    }

    const newNumber = new TwilioNumber({
      owner: username,
      number,
      accountSid,
      authToken,
    });

    await newNumber.save();
    res.status(201).json({ message: 'Número cadastrado com sucesso!', data: newNumber });
  } catch (error) {
    console.error('Erro ao cadastrar número Twilio:', error);
    res.status(500).json({ error: 'Erro ao cadastrar número' });
  }
});

// Listar números do cliente logado
router.get('/twilio-number', authenticateJWT, async (req: Request, res: Response) => {
  const username = (req as any).user?.username;

  if (!username) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  try {
    const numbers = await TwilioNumber.find({ owner: username });
    res.json(numbers);
  } catch (error) {
    console.error('Erro ao buscar números do cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar números' });
  }
});

export default router;
