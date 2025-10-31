import Cliente from '../../infraestructure/mongo/models/clienteModel';

// Ajuste os campos conforme sua base: por ex. cliente.webchat.totalConversations, usedConversations, etc.
export async function grantWebchatConversations(username: string, amount: number) {
  if (!username || !amount) return;

  // Exemplo simples: soma no campo totalConversations (ou creditsRemaining…) de um subdoc webchat
  await Cliente.updateOne(
    { username },
    {
      $inc: { 'webchat.totalConversations': amount },
      $setOnInsert: {
        'webchat.usedConversations': 0,
        'webchat.periodStart': new Date(),
        'webchat.periodEnd': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias (ajuste se quiser)
      },
    },
    { upsert: false }
  ).exec();
}
