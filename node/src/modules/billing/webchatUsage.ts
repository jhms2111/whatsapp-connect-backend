//webchatUsage.ts

import WebchatQuota, { IWebchatQuota } from '../../infraestructure/mongo/models/webchatQuotaModel';

const CHARS_PER_CONVERSATION = 500;

export type WebchatSpendResult = {
  ok: boolean;
  spent: number;
  remainingChars: number;
  maxChars: number;
  usedCharacters: number;
};

export async function spendWebchatCharacters(username: string, delta: number): Promise<WebchatSpendResult> {
  if (!username || !Number.isFinite(delta) || delta <= 0) {
    return { ok: false, spent: 0, remainingChars: 0, maxChars: 0, usedCharacters: 0 };
  }

  // lê o mínimo
  const doc = await WebchatQuota
    .findOne({ username }, { totalConversations: 1, usedCharacters: 1 })
    .lean<IWebchatQuota | null>();

  if (!doc || !doc.totalConversations) {
    return {
      ok: false,
      spent: 0,
      remainingChars: 0,
      maxChars: 0,
      usedCharacters: doc?.usedCharacters || 0,
    };
  }

  const maxChars = (doc.totalConversations || 0) * CHARS_PER_CONVERSATION;
  const already = doc.usedCharacters || 0;

  if (already >= maxChars) {
    return { ok: false, spent: 0, remainingChars: 0, maxChars, usedCharacters: already };
  }

  const allowed = Math.min(delta, maxChars - already);

  const updated = await WebchatQuota.findOneAndUpdate(
    { username, usedCharacters: already }, // controle básico de corrida
    { $inc: { usedCharacters: allowed }, $set: { updatedAt: new Date() } },
    { new: true }
  ).lean<IWebchatQuota | null>();

  if (!updated) {
    // houve corrida — tenta 1 vez de novo
    return spendWebchatCharacters(username, delta);
  }

  const usedCharacters = updated.usedCharacters || 0;
  const remainingChars = Math.max(maxChars - usedCharacters, 0);

  return { ok: true, spent: allowed, remainingChars, maxChars, usedCharacters };
}

export function deriveWebchatUsedConversations(usedCharacters: number) {
  return Math.ceil((usedCharacters || 0) / CHARS_PER_CONVERSATION);
}
