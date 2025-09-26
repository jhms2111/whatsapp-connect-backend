// src/infraestructure/express/routes/adminBotRoutes.ts
import { Router, Request, Response } from 'express';
import Bot from '../../mongo/models/botModel';
import { adminOnly } from '../middleware/adminMiddleware';

const router = Router();

/**
 * GET /api/admin/bots/:owner
 */
router.get('/bots/:owner', adminOnly, async (req: Request, res: Response) => {
  try {
    const bots = await Bot.find({ owner: req.params.owner }).populate('product').lean();
    res.json(bots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar bots' });
  }
});

/**
 * POST /api/admin/bots/:owner
 */
router.post('/bots/:owner', adminOnly, async (req: Request, res: Response) => {
  try {
    const bot = await Bot.create({ ...req.body, owner: req.params.owner });
    res.status(201).json(bot);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao criar bot' });
  }
});

/**
 * PUT /api/admin/bots/:id
 */
router.put('/bots/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const updated = await Bot.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Bot não encontrado' });
    res.json(updated);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao atualizar bot' });
  }
});

/**
 * DELETE /api/admin/bots/:id
 */
router.delete('/bots/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const deleted = await Bot.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Bot não encontrado' });
    res.json({ message: 'Bot removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover bot' });
  }
});

export default router;
