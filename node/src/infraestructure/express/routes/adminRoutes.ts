// src/infraestructure/express/routes/adminRoutes.ts
import { Router, Request, Response } from 'express';
import User from '../../mongo/models/userModel';
import { adminOnly } from '../middleware/adminMiddleware';
import jwt from 'jsonwebtoken';

const router = Router();

// GET /api/admin/clients
router.get('/clients', adminOnly, async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, 'username createdAt lastLogin').lean();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// POST /api/admin/impersonate/:username
router.post('/impersonate/:username', adminOnly, async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' } // token temporário
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar token de impersonação' });
  }
});

export default router;
