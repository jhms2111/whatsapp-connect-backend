//conversationService.ts

import ConversationQuota from '../../../infraestructure/mongo/models/conversationQuotaModel';

interface Consumption {
  username: string;
  charsEntrada: number;
  charsResposta: number;
  limiteEntrada: number;
  limiteResposta: number;
}

export async function consumeConversation({ username, charsEntrada, charsResposta, limiteEntrada, limiteResposta }: Consumption) {
  const quota = await ConversationQuota.findOne({ username });
  if (!quota) throw new Error('Usuário sem pacote ativo');

  const usedConversas = Math.ceil(charsEntrada / limiteEntrada + charsResposta / limiteResposta);

  if (quota.usedConversations + usedConversas <= quota.totalConversations) {
    quota.usedConversations += usedConversas;
  } else {
    const excess = quota.usedConversations + usedConversas - quota.totalConversations;
    quota.usedConversations = quota.totalConversations;

    const cost = excess * 0.09;
    quota.creditEuros -= cost;
    if (quota.creditEuros < 0) quota.creditEuros = 0;
  }

  await quota.save();
  return quota;
}
