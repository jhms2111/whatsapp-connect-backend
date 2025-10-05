// src/modules/payment/consumeConversation.ts

import ConversationQuota from '../infraestructure/mongo/models/conversationQuotaModel';

interface Consumption {
  username: string;
  charsEntrada: number;   // caracteres da mensagem do usuário
  charsResposta: number;  // caracteres da resposta do bot
  limiteEntrada: number;  // do pacote
  limiteResposta: number; // do pacote
}

/**
 * Consome as conversas do pacote ou do crédito do usuário.
 * @param consumption - dados de uso da conversa
 * @returns quota atualizada
 */
export async function consumeConversation(consumption: Consumption) {
  const { username, charsEntrada, charsResposta } = consumption;

  const quota = await ConversationQuota.findOne({ username });
  if (!quota) throw new Error('Usuário sem pacote ativo');

  // 1 conversa = 500 caracteres (entrada + resposta)
  const totalChars = charsEntrada + charsResposta;
  const usedConversas = Math.ceil(totalChars / 500);

  if (quota.usedConversations + usedConversas <= quota.totalConversations) {
    quota.usedConversations += usedConversas;
  } else {
    const excess = quota.usedConversations + usedConversas - quota.totalConversations;
    quota.usedConversations = quota.totalConversations;

    // Debita do crédito a cada conversa extra = 0,04 €
    const cost = excess * 0.04;
    quota.creditEuros -= cost;
    if (quota.creditEuros < 0) quota.creditEuros = 0;
  }

  await quota.save();
  return quota;
}

