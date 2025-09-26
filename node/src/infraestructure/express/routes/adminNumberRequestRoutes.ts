// src/infraestructure/express/routes/adminNumberRequestRoutes.ts
import { Router, Request, Response } from 'express';
import NumberRequest from '../../mongo/models/numberRequestModel';
import { adminOnly } from '../middleware/adminMiddleware';

const router = Router();

/**
 * GET /api/admin/number-requests/:username
 */
router.get('/number-requests/:username', adminOnly, async (req: Request, res: Response) => {
  try {
    const requests = await NumberRequest.find({ username: req.params.username }).lean();
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

/**
 * PUT /api/admin/number-requests/:id
 * Aprovar / Rejeitar / Atualizar
 */
router.put('/number-requests/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const updated = await NumberRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});
export default router;
