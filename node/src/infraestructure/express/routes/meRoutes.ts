// src/infraestructure/express/routes/meRoutes.ts
import { Router, Request, Response } from 'express';
import User from '../../mongo/models/userModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.get('/me/status', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const u = (req as any).user;
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const usr = await User.findOne(
      { username: u.username },
      { username: 1, status: 1, blockedAt: 1, blockedReason: 1, createdAt: 1, updatedAt: 1, role: 1, email: 1 }
    ).lean();
    if (!usr) return res.status(404).json({ error: 'Usuário não encontrado' });

    return res.json({
      username: usr.username,
      email: usr.email,
      role: usr.role,
      status: (usr as any).status || 'active',
      blockedAt: (usr as any).blockedAt || null,
      blockedReason: (usr as any).blockedReason || null,
      createdAt: usr.createdAt,
      updatedAt: usr.updatedAt,
    });
  } catch (e) {
    console.error('[me/status] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
