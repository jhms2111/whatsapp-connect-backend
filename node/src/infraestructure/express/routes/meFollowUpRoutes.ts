// src/infraestructure/express/routes/meFollowUpRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireActiveUser } from '../middleware/requireActiveUser';
import Cliente, { ICliente } from '../../mongo/models/clienteModel';

const router = Router();

/**
 * GET /api/me/follow-up
 * Retorna as configs de follow-up do usuário autenticado
 */
router.get(
  '/me/follow-up',
  authenticateJWT,
  requireActiveUser,
  async (req: Request, res: Response) => {
    try {
      const u = (req as any).user as { username: string };
      if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

      const cli = await Cliente.findOne(
        { username: u.username },
        { followUpEnabled: 1, followUpMessage: 1, followUpDelayMinutes: 1 }
      )
        .lean<ICliente>()
        .exec();

      if (!cli) return res.status(404).json({ error: 'Usuário não encontrado' });

      return res.json({
        followUpEnabled: !!cli.followUpEnabled,
        followUpMessage: cli.followUpMessage || '',
        followUpDelayMinutes:
          typeof cli.followUpDelayMinutes === 'number' ? cli.followUpDelayMinutes : 60,
      });
    } catch (e) {
      console.error('[GET /me/follow-up] erro:', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

/**
 * PUT /api/me/follow-up
 * Body: { enabled: boolean, message: string, delayMinutes: number }
 * Atualiza as configs de follow-up do usuário autenticado
 */
router.put(
  '/me/follow-up',
  authenticateJWT,
  requireActiveUser,
  async (req: Request, res: Response) => {
    try {
      const u = (req as any).user as { username: string };
      if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

      const { enabled, message, delayMinutes } = req.body as {
        enabled?: boolean;
        message?: string;
        delayMinutes?: number;
      };

      const followUpEnabled = !!enabled;
      const followUpMessage = (message ?? '').toString().slice(0, 2000);
      const followUpDelayMinutes = Math.max(
        1,
        Math.min(1440, Number(delayMinutes ?? 60))
      );

      const updated = await Cliente.findOneAndUpdate(
        { username: u.username },
        {
          $set: {
            followUpEnabled,
            followUpMessage,
            followUpDelayMinutes,
          },
        },
        { new: true }
      )
        .lean<ICliente>()
        .exec();

      if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });

      return res.json({
        ok: true,
        followUpEnabled: !!updated.followUpEnabled,
        followUpMessage: updated.followUpMessage || '',
        followUpDelayMinutes:
          typeof updated.followUpDelayMinutes === 'number'
            ? updated.followUpDelayMinutes
            : 60,
      });
    } catch (e) {
      console.error('[PUT /me/follow-up] erro:', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

export default router;
