import { Router, Request, Response } from 'express';
import Cliente from '../../mongo/models/clienteModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/webchat/bots/global-status
 * Retorna { botsEnabled: boolean } para o usuário autenticado
 */
router.get('/webchat/bots/global-status', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const u = (req as any)?.user?.username;
    if (!u) return res.status(401).json({ error: 'Não autenticado' });

    const cli = await Cliente.findOne({ username: u }, { botsEnabled: 1 }).lean();
    const botsEnabled = typeof (cli as any)?.botsEnabled === 'boolean' ? (cli as any).botsEnabled : true;

    return res.json({ botsEnabled });
  } catch (e) {
    console.error('[webchat/bots/global-status] GET erro:', e);
    return res.status(500).json({ error: 'Erro ao obter estado dos bots' });
  }
});

/**
 * PUT /api/webchat/bots/global-status
 * body: { botsEnabled: boolean }
 * Atualiza a flag no Cliente do usuário autenticado
 */
router.put('/webchat/bots/global-status', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const u = (req as any)?.user?.username;
    if (!u) return res.status(401).json({ error: 'Não autenticado' });

    const { botsEnabled } = req.body as { botsEnabled?: boolean };
    if (typeof botsEnabled !== 'boolean') {
      return res.status(400).json({ error: 'botsEnabled precisa ser boolean' });
    }

    await Cliente.updateOne({ username: u }, { $set: { botsEnabled } }, { upsert: true });

    return res.json({ botsEnabled });
  } catch (e) {
    console.error('[webchat/bots/global-status] PUT erro:', e);
    return res.status(500).json({ error: 'Erro ao atualizar estado dos bots' });
  }
});

export default router;
