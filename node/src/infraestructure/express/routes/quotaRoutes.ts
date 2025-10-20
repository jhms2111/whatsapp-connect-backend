// src/infraestructure/express/routes/quotaRoutes.ts
import express, { Request, Response } from 'express';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireActiveUser } from '../middleware/requireActiveUser';

const router = express.Router();
const CHARS_PER_CONVERSATION = 500;

// Se o período expirou, zera no banco.
async function ensureFreshness(quota: any): Promise<any> {
  const now = new Date();
  if (quota?.periodEnd && now > new Date(quota.periodEnd)) {
    quota.totalConversations = 0;
    quota.usedCharacters = 0;
    quota.coins = 0;
    quota.coinsExpiresAt = null;
    quota.periodStart = null;
    quota.periodEnd = null;
    await quota.save();
  }
  return quota;
}

/**
 * GET /api/quota
 * Detalhado — usado pelo QuotaDashboard.jsx
 */
router.get('/quota', authenticateJWT, requireActiveUser, async (req: any, res: Response) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    const quota = await ConversationQuota.findOne({ username });
    if (!quota) {
      return res.json({
        username,
        totalConversations: 0,
        usedConversations: 0,
        usedCharacters: 0,
        remainingConversations: 0,
        packageType: null,
        coins: 0,
        coinsExpiresAt: null,
        periodStart: null,
        periodEnd: null,
        expiresInSeconds: 0,
      });
    }

    await ensureFreshness(quota);

    const total = Number(quota.totalConversations || 0);
    const usedConversations = Math.ceil((Number(quota.usedCharacters || 0)) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max(total - usedConversations, 0);

    const now = new Date();
    const end = quota.periodEnd ? new Date(quota.periodEnd) : null;
    const expiresInSeconds = end ? Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000)) : 0;

    return res.json({
      username: quota.username,
      totalConversations: total,
      usedConversations,
      usedCharacters: quota.usedCharacters || 0,
      remainingConversations,
      packageType: quota.packageType ?? null,
      coins: quota.coins ?? 0,
      coinsExpiresAt: quota.coinsExpiresAt ?? null,
      periodStart: quota.periodStart ?? null,
      periodEnd: quota.periodEnd ?? null,
      expiresInSeconds,
    });
  } catch (err: any) {
    console.error('[API] GET /api/quota error:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao obter quota' });
  }
});

/**
 * GET /api/quota/summary
 * Resumo simples — usado no PainelCliente.jsx para mostrar apenas "créditos restantes".
 */
router.get('/quota/summary', authenticateJWT, requireActiveUser, async (req: any, res: Response) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    const quota = await ConversationQuota.findOne(
      { username },
      { totalConversations: 1, usedCharacters: 1, periodEnd: 1, coinsExpiresAt: 1 }
    ).lean();

    if (!quota) {
      return res.json({ creditsRemaining: 0, periodEnd: null, coinsExpiresAt: null });
    }

    const total = Number(quota.totalConversations || 0);
    const usedConversations = Math.ceil((Number(quota.usedCharacters || 0)) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max(total - usedConversations, 0);

    return res.json({
      creditsRemaining: remainingConversations,
      periodEnd: quota.periodEnd ?? null,
      coinsExpiresAt: quota.coinsExpiresAt ?? null,
    });
  } catch (e) {
    console.error('[API] GET /api/quota/summary error:', e);
    return res.status(500).json({ error: 'Erro ao obter quota summary' });
  }
});

/**
 * GET /api/usage/summary
 * Alias para compatibilidade (mesmo retorno de /quota/summary).
 */
router.get('/usage/summary', authenticateJWT, requireActiveUser, async (req: any, res: Response) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    const quota = await ConversationQuota.findOne(
      { username },
      { totalConversations: 1, usedCharacters: 1, periodEnd: 1, coinsExpiresAt: 1 }
    ).lean();

    if (!quota) {
      return res.json({ creditsRemaining: 0, periodEnd: null, coinsExpiresAt: null });
    }

    const total = Number(quota.totalConversations || 0);
    const usedConversations = Math.ceil((Number(quota.usedCharacters || 0)) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max(total - usedConversations, 0);

    return res.json({
      creditsRemaining: remainingConversations,
      periodEnd: quota.periodEnd ?? null,
      coinsExpiresAt: quota.coinsExpiresAt ?? null,
    });
  } catch (e) {
    console.error('[API] GET /api/usage/summary error:', e);
    return res.status(500).json({ error: 'Erro ao obter usage summary' });
  }
});

/**
 * GET /api/quota/debug
 * Documento cru do Mongo (diagnóstico).
 */
router.get('/quota/debug', authenticateJWT, requireActiveUser, async (req: any, res) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    const doc = await ConversationQuota.findOne({ username }).lean();
    return res.json({ username, doc });
  } catch (err: any) {
    console.error('[API] GET /api/quota/debug error:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao obter quota debug' });
  }
});

export default router;
