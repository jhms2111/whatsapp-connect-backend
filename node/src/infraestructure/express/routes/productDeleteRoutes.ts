import { Router } from 'express';
import Product from '../../mongo/models/productModel';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const router = Router();

// Middleware para extrair o nome de usuário do token JWT
const getUsernameFromToken = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(' ')[1];
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
    return decoded.username as string;
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return null;
  }
};

// DELETE /api/product/:id — Exclui um produto
router.delete('/product/:id', async (req, res) => {
  const username = getUsernameFromToken(req);
  if (!username) {
    console.error("Token inválido ou ausente");
    return res.status(401).json({ error: 'Token inválido ou ausente' });
  }

  // Verifique se o ID é válido
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.error(`ID de produto inválido: ${req.params.id}`);
    return res.status(400).json({ error: 'ID de produto inválido' });
  }

  try {
    // Agora podemos buscar o produto, pois o ID foi validado
    const product = await Product.findById(req.params.id);
    if (!product) {
      console.error(`Produto com ID ${req.params.id} não encontrado`);
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Verifique se o dono do produto é o usuário atual
    if (product.owner !== username) {
      console.error(`Usuário ${username} tentando excluir produto de outro usuário`);
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }

    // Use o deleteOne ou findByIdAndDelete para excluir o produto
    await product.deleteOne(); // Ou use Product.findByIdAndDelete(req.params.id);

    console.log(`Produto com ID ${req.params.id} deletado com sucesso`);
    res.status(200).json({ message: 'Produto deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro interno ao deletar o produto.' });
  }
});


export default router;
