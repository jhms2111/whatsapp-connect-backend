// src/infraestructure/express/routes/quotaRoutes.ts
import express from 'express';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';
import { authenticateJWT } from '../middleware/authMiddleware';

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
 * GET /api/quota  (protegidinha com JWT)
 * -> Sempre retorna: periodStart, periodEnd, coinsExpiresAt, expiresInSeconds, etc.
 */
router.get('/api/quota', authenticateJWT, async (req: any, res) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    console.log('[/api/quota] username:', username);

    const quota = await ConversationQuota.findOne({ username });
    if (!quota) {
      const payload = {
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
      };
      console.log('[/api/quota] response (sem quota):', payload);
      return res.json(payload);
    }

    await ensureFreshness(quota);

    const total = Number(quota.totalConversations || 0);
    const usedConversations = Math.ceil((Number(quota.usedCharacters || 0)) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max(total - usedConversations, 0);

    const now = new Date();
    const end = quota.periodEnd ? new Date(quota.periodEnd) : null;
    const expiresInSeconds = end ? Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000)) : 0;

    const payload = {
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
    };

    console.log('[/api/quota] response:', {
      username: payload.username,
      periodEnd: payload.periodEnd,
      coinsExpiresAt: payload.coinsExpiresAt,
      expiresInSeconds: payload.expiresInSeconds,
      totalConversations: payload.totalConversations,
      usedConversations: payload.usedConversations,
    });

    return res.json(payload);
  } catch (err: any) {
    console.error('[API] /api/quota error:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao obter quota' });
  }
});

/**
 * GET /api/quota/debug  (só para diagnosticar — remova depois)
 * -> Devolve o documento cru do Mongo para ver se os campos existem.
 */
router.get('/api/quota/debug', authenticateJWT, async (req: any, res) => {
  try {
    const username: string | undefined = req.user?.username;
    if (!username) return res.status(401).json({ error: 'Não autorizado' });

    const doc = await ConversationQuota.findOne({ username }).lean();
    return res.json({ username, doc });
  } catch (err: any) {
    console.error('[API] /api/quota/debug error:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao obter quota debug' });
  }
});

export default router;
