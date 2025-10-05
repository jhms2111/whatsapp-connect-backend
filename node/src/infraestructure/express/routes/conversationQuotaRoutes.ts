// src/infraestructure/express/routes/quota.ts
import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';
import { spendCharacters } from '../../../modules/billing/usage';


const router = Router();
const CHARS_PER_CONVERSATION = 500;

router.get('/', authenticateJWT, async (req, res) => {
  try {
    const username = (req as any).user.username as string;

    const quota = await ConversationQuota.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          username,
          totalConversations: 0,
          usedCharacters: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    ).lean();

    const usedConversations = Math.ceil((quota.usedCharacters || 0) / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max((quota.totalConversations || 0) - usedConversations, 0);

    res.json({
      username: quota.username,
      totalConversations: quota.totalConversations || 0,
      usedConversations,
      remainingConversations,
      usedCharacters: quota.usedCharacters || 0,
      packageType: quota.packageType ?? null,
    });
  } catch (err) {
    console.error('Erro ao buscar quota do usuário:', err);
    res.status(500).json({ error: 'Erro interno ao buscar quota.' });
  }
});


router.post('/consume', authenticateJWT, async (req, res) => {
  try {
    const username = (req as any).user.username as string;
    const { charsEntrada = 0, charsResposta = 0 } = req.body || {};
    const delta = Math.max(0, Number(charsEntrada) + Number(charsResposta));

    // debita de forma atômica
    const { usedCharacters } = await (async () => {
      const r = await spendCharacters(username, delta);
      if (!r.ok && r.spent === 0) {
        return { usedCharacters: r.maxChars }; // já esgotado
      }
      return { usedCharacters: r.usedCharacters };
    })();

    // devolve estado
    const quota = await ConversationQuota.findOne({ username }, { totalConversations: 1, usedCharacters: 1 }).lean();
    const usedConversations = Math.ceil((quota!.usedCharacters || 0) / 500);
    const remainingConversations = Math.max((quota!.totalConversations || 0) - usedConversations, 0);

    res.json({
      username,
      totalConversations: quota!.totalConversations || 0,
      usedConversations,
      remainingConversations,
      usedCharacters: quota!.usedCharacters || 0,
      packageType: quota!['packageType'] ?? null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao consumir quota.' });
  }
});

export default router;
