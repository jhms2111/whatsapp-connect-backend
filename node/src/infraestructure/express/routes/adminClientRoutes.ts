// src/infraestructure/express/routes/adminClientRoutes.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { adminOnly } from '../middleware/adminMiddleware';
import Cliente from '../../mongo/models/clienteModel';
import Product from '../../mongo/models/productModel';
import Bot from '../../mongo/models/botModel';
import NumberRequest from '../../mongo/models/numberRequestModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const router = Router();

/**
 * GET /api/admin/clients
 * Lista todos os clientes
 */
router.get('/clients', adminOnly, async (_req: Request, res: Response) => {
  try {
    const clients = await Cliente.find().sort({ createdAt: -1 }).lean();
    res.json(clients);
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
    const cliente = await Cliente.findById(clientId).lean();
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const [products, bots, numberRequests, twilioNumbers] = await Promise.all([
      Product.find({ owner: cliente.username }).lean(),
      Bot.find({ owner: cliente.username }).lean(),
      NumberRequest.find({ username: cliente.username }).lean(),
      TwilioNumber.find({ owner: cliente.username }).lean(),
    ]);

    res.json({ cliente, products, bots, numberRequests, twilioNumbers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar detalhes do cliente' });
  }
});

/**
 * POST /api/admin/clients/:clientId/impersonate
 * Gera JWT temporário para entrar na conta do cliente
 */
router.post('/clients/:clientId/impersonate', adminOnly, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const cliente = await Cliente.findById(clientId).lean();
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const token = jwt.sign({ username: cliente.username, role: 'user' }, JWT_SECRET, { expiresIn: '10m' });
    res.json({ token, expiresIn: 600 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar token de impersonation' });
  }
});

export default router;
