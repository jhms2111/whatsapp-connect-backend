// src/infraestructure/express/routes/botsGlobalRoutes.ts
import { Router, Request, Response } from 'express';
import Cliente from '../../mongo/models/clienteModel';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireActiveUser } from '../middleware/requireActiveUser';

const router = Router();

type ClienteFlags = {
  botsEnabled?: boolean;
};

router.get('/bots/global-status', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const u = (req as any).user as { username: string };
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const cli = await Cliente.findOne({ username: u.username }, { botsEnabled: 1 }).lean<ClienteFlags>().exec();
    if (!cli) return res.status(404).json({ error: 'Usuário não encontrado' });

    return res.json({ botsEnabled: typeof cli.botsEnabled === 'boolean' ? cli.botsEnabled : true });
  } catch (e) {
    console.error('[bots/global-status] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/bots/global-status', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const u = (req as any).user as { username: string };
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const { botsEnabled } = req.body as { botsEnabled?: boolean };
    if (typeof botsEnabled !== 'boolean') {
      return res.status(400).json({ error: "Campo 'botsEnabled' deve ser boolean." });
    }

    const updated = await Cliente.findOneAndUpdate(
      { username: u.username },
      { $set: { botsEnabled } },
      { new: true, projection: { username: 1, botsEnabled: 1 } }
    ).lean<ClienteFlags>().exec();

    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json({ message: 'Atualizado', botsEnabled: !!updated.botsEnabled });
  } catch (e) {
    console.error('[bots/global-status PUT] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
