// src/infraestructure/express/routes/adminProductRoutes.ts
import { Router, Request, Response } from 'express';
import Product from '../../mongo/models/productModel';
import { adminOnly } from '../middleware/adminMiddleware';

const router = Router();

/**
 * GET /api/admin/products/:owner
 * Lista produtos de um cliente
 */
router.get('/products/:owner', adminOnly, async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ owner: req.params.owner }).lean();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

/**
 * POST /api/admin/products/:owner
 * Adiciona produto para um cliente
 */
router.post('/products/:owner', adminOnly, async (req: Request, res: Response) => {
  try {
    const payload = { ...req.body, owner: req.params.owner };
    const product = await Product.create(payload);
    res.status(201).json(product);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao criar produto' });
  }
});

/**
 * PUT /api/admin/products/:id
 * Atualiza produto
 */
router.put('/products/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(updated);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao atualizar produto' });
  }
});

/**
 * DELETE /api/admin/products/:id
 */
router.delete('/products/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ message: 'Produto removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

export default router;
