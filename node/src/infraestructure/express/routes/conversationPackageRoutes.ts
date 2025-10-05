// src/infraestructure/express/routes/conversationPackageRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = Router();

const CHARS_PER_CONVERSATION = 350;

type PackageType = keyof typeof PACKAGES;

interface JWTUser {
  username: string;
  role: 'admin' | 'user';
}

// POST /api/payment/activate-package
router.post('/activate-package', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: JWTUser }).user;
    if (!user) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { username } = user;
    const { packageType } = req.body as { packageType: number };

    const pacote = PACKAGES[packageType as PackageType];
    if (!pacote) return res.status(400).json({ error: 'Pacote inválido' });

    // Upsert e reset do consumo em caracteres
    const quota = await ConversationQuota.findOneAndUpdate(
      { username },
      {
        $setOnInsert: { username, createdAt: new Date() },
        $set: {
          totalConversations: pacote.conversations,
          usedCharacters: 0,          // zera consumo
          packageType: Number(packageType),
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    ).lean();

    const usedConversations = Math.ceil((quota!.usedCharacters || 0) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max((quota!.totalConversations || 0) - usedConversations, 0);

    res.json({
      message: 'Pacote ativado com sucesso',
      quota: {
        username: quota!.username,
        totalConversations: quota!.totalConversations || 0,
        usedConversations,
        remainingConversations,
        usedCharacters: quota!.usedCharacters || 0,
        packageType: quota!.packageType ?? null,
      },
    });
  } catch (err) {
    console.error('Erro ao ativar pacote:', err);
    res.status(500).json({ error: 'Erro interno ao ativar pacote' });
  }
});

export default router;
