import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../../mongo/models/productModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// ✅ DELETE /api/product/:id — remove produto do dono
router.delete(
  '/product/:id',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as { username: string };
      if (!user?.username) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID de produto inválido' });
      }

      const prod = await Product.findById(id);
      if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
      if (prod.owner !== user.username) {
        return res.status(403).json({ error: 'Acesso não autorizado' });
      }

      await prod.deleteOne();
      return res.status(200).json({ message: 'Produto deletado com sucesso' });
    } catch (error) {
      console.error('[PRODUCT] delete error:', error);
      return res.status(500).json({ error: 'Erro interno ao deletar o produto.' });
    }
  }
);

export default router;
