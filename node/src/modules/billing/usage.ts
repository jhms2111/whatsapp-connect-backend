// src/modules/billing/usage.ts
import ConversationQuota from '../../infraestructure/mongo/models/conversationQuotaModel';

const CHARS_PER_CONVERSATION = 500;

export type SpendResult = {
  ok: boolean;                // true = consumiu (total ou parcial), false = já esgotado
  spent: number;              // quantos caracteres foram efetivamente abatidos
  remainingChars: number;     // quanto ainda sobra em caracteres
  maxChars: number;           // totalConversations * 500
  usedCharacters: number;     // valor após a operação
};

export async function spendCharacters(username: string, delta: number): Promise<SpendResult> {
  if (!username || !Number.isFinite(delta) || delta <= 0) {
    return { ok: false, spent: 0, remainingChars: 0, maxChars: 0, usedCharacters: 0 };
  }

  // 1) lê o mínimo necessário (rápido)
  const doc = await ConversationQuota
    .findOne({ username }, { totalConversations: 1, usedCharacters: 1 })
    .lean();

  if (!doc || !doc.totalConversations) {
    return { ok: false, spent: 0, remainingChars: 0, maxChars: 0, usedCharacters: doc?.usedCharacters || 0 };
  }

  const maxChars = (doc.totalConversations || 0) * CHARS_PER_CONVERSATION;
  const already = doc.usedCharacters || 0;

  if (already >= maxChars) {
    return { ok: false, spent: 0, remainingChars: 0, maxChars, usedCharacters: already };
  }

  const allowed = Math.min(delta, maxChars - already);

  // 2) incremento atômico (uma única operação)
  const updated = await ConversationQuota.findOneAndUpdate(
    { username, usedCharacters: already },           // guarda consistência básica
    { $inc: { usedCharacters: allowed }, $set: { updatedAt: new Date() } },
    { new: true }
  ).lean();

  // Se houve corrida e a condição do filtro falhou, refaça uma única vez
  if (!updated) {
    return spendCharacters(username, delta);
  }

  const usedCharacters = updated.usedCharacters || 0;
  const remainingChars = Math.max(maxChars - usedCharacters, 0);

  return { ok: true, spent: allowed, remainingChars, maxChars, usedCharacters };
}

export function deriveUsedConversations(usedCharacters: number) {
  return Math.ceil((usedCharacters || 0) / CHARS_PER_CONVERSATION);
}
