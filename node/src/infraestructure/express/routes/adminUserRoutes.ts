// src/infraestructure/express/routes/adminUserRoutes.ts
import { Router, Request, Response } from 'express';
import { adminOnly } from '../middleware/adminMiddleware';
import User from '../../mongo/models/userModel';

const router = Router();

/**
 * GET /api/admin/users/:username
 * Consulta status do usuário
 */
router.get('/users/:username', adminOnly, async (req: Request, res: Response) => {
  try {
    const user = await User.findOne(
      { username: req.params.username },
      {
        username: 1,
        status: 1,
        blockedAt: 1,
        blockedReason: 1,
        createdAt: 1,
        updatedAt: 1,
        role: 1,
        email: 1,
      }
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      blockedAt: user.blockedAt || null,
      blockedReason: user.blockedReason || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (e) {
    console.error('[GET /users/:username] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * PUT /api/admin/users/:username/block
 * Troca status: { status: 'blocked' | 'active', reason? }
 */
router.put('/users/:username/block', adminOnly, async (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body as { status?: 'blocked' | 'active'; reason?: string };

    if (status !== 'blocked' && status !== 'active') {
      return res.status(400).json({ error: "Campo 'status' deve ser 'blocked' ou 'active'." });
    }

    const update =
      status === 'blocked'
        ? {
            $set: {
              status: 'blocked',
              blockedAt: new Date(),
              blockedReason: reason ? String(reason).slice(0, 500) : undefined,
            },
          }
        : {
            $set: { status: 'active' },
            $unset: { blockedAt: '', blockedReason: '' },
          };

    const updated = await User.findOneAndUpdate(
      { username: req.params.username },
      update,
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({
      message: status === 'blocked' ? 'Usuário bloqueado' : 'Usuário desbloqueado',
      user: {
        username: updated.username,
        status: updated.status || 'active',
        blockedAt: updated.blockedAt || null,
        blockedReason: updated.blockedReason || null,
      },
    });
  } catch (e) {
    console.error('[PUT /users/:username/block] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
