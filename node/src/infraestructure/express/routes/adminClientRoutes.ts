// src/infraestructure/express/routes/adminClientRoutes.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { adminOnly } from '../middleware/adminMiddleware';
import User from '../../mongo/models/userModel';
import Product from '../../mongo/models/productModel';
import Bot from '../../mongo/models/botModel';
import NumberRequest from '../../mongo/models/numberRequestModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const router = Router();

/**
 * GET /api/admin/clients
 * Lista todos os clientes (baseado no User oficial)
 */
router.get('/clients', adminOnly, async (_req: Request, res: Response) => {
  try {
    const clients = await User.find(
      {},
      {
        username: 1,
        createdAt: 1,
        status: 1,
        blockedAt: 1,
        blockedReason: 1,
        role: 1,
        email: 1,
      }
    )
      .sort({ createdAt: -1 })
      .lean();

    // Mantém compatível com o front (lastLogin não existe no schema oficial — retorna undefined)
    const shaped = clients.map((u) => ({
      username: u.username,
      createdAt: u.createdAt,
      lastLogin: undefined as unknown as Date | undefined,
      status: u.status || 'active',
      blockedAt: u.blockedAt || null,
      blockedReason: u.blockedReason || null,
      role: u.role,
      email: u.email,
    }));

    res.json(shaped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

/**
 * GET /api/admin/clients/:clientId
 * Detalhes do cliente + recursos (produtos, bots, pedidos, TwilioNumbers)
 */
router.get('/clients/:clientId', adminOnly, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const user = await User.findById(clientId).lean();
    if (!user) return res.status(404).json({ error: 'Cliente não encontrado' });

    const [products, bots, numberRequests, twilioNumbers] = await Promise.all([
      Product.find({ owner: user.username }).lean(),
      Bot.find({ owner: user.username }).lean(),
      NumberRequest.find({ username: user.username }).lean(),
      TwilioNumber.find({ owner: user.username }).lean(),
    ]);

    res.json({ cliente: user, products, bots, numberRequests, twilioNumbers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar detalhes do cliente' });
  }
});

/**
 * POST /api/admin/impersonate/:username
 * Gera JWT temporário para entrar na conta do cliente
 */
router.post('/impersonate/:username', adminOnly, async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(404).json({ error: 'Cliente não encontrado' });

    const payload = {
      username: user.username,
      role: 'user',
      imp: true,
      sid: `${user.username}:${Date.now()}`,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
    return res.json({ token, expiresIn: 600 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao gerar token de impersonation' });
  }
});

export default router;
