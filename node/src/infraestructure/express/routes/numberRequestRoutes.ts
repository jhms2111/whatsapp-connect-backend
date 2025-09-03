import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import NumberRequest from '../../mongo/models/numberRequestModel';

const router = Router();

// Cria um pedido (se não existir outro em andamento)
router.post('/number-requests', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id: userId, username } = (req as any).user;

    const open = await NumberRequest.findOne({
      username,
      status: { $in: ['pending_review', 'paid'] },
    }).lean();

    if (open) {
      return res.status(400).json({ error: 'Já existe um pedido em andamento.' });
    }

    const nr = await NumberRequest.create({
      userId,              // ✅ grave o userId
      username,
      status: 'pending_review',
    });

    return res.status(201).json(nr);
  } catch (err) {
    console.error('[NR] create error:', err);
    return res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});


// Lista pedidos do usuário logado
router.get('/number-requests/mine', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = (req as any).user.username;
    const list = await NumberRequest.find({ username }).sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error('[NR] mine error:', err);
    return res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
});

// (Opcional) Fallback para ?me=1
router.get('/number-requests', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const me = req.query.me;
    if (me) {
      const username = (req as any).user.username;
      const list = await NumberRequest.find({ username }).sort({ createdAt: -1 }).lean();
      return res.json(list);
    }
    return res.status(404).json({ error: 'Rota não suportada' });
  } catch (err) {
    console.error('[NR] list error:', err);
    return res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
});

export default router;
