// src/infraestructure/express/routes/meBotsRoutes.ts
import { Router, Request, Response } from 'express';
import User from '../../mongo/models/userModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

/** GET /api/me/bots-enabled */
router.get('/me/bots-enabled', authenticateJWT, async (req: Request, res: Response) => {
  const u = (req as any).user as { username: string } | undefined;
  if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

  const user = await User.findOne({ username: u.username }, { botsEnabled: 1 }).lean();
  const enabled = typeof user?.botsEnabled === 'boolean' ? user.botsEnabled : true;
  return res.json({ botsEnabled: enabled });
});

/** PUT /api/me/bots-enabled  body: { enabled: boolean } */
router.put('/me/bots-enabled', authenticateJWT, async (req: Request, res: Response) => {
  const u = (req as any).user as { username: string } | undefined;
  if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "Campo 'enabled' deve ser boolean" });
  }

  await User.updateOne({ username: u.username }, { $set: { botsEnabled: enabled } });
  return res.json({ message: enabled ? 'Bots ativados' : 'Bots pausados', botsEnabled: enabled });
});

export default router;
