import twilio from 'twilio';

const SID   = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM  = process.env.TWILIO_FROM_NUMBER || '';   // fallback (número)
const SENDER_ID = process.env.TWILIO_SENDER_ID || ''; // nome (ex: ENKI)

let client: twilio.Twilio | null = null;
if (SID && TOKEN) {
  client = twilio(SID, TOKEN);
}

export async function sendSmsE164(toE164: string, body: string) {
  if (!client) {
    throw new Error('Twilio client não configurado.');
  }

  // Prioriza o Sender ID (nome). Se não tiver, usa o número.
  const from = SENDER_ID || FROM;

  if (!from) {
    throw new Error('Nenhum remetente configurado. Defina TWILIO_SENDER_ID ou TWILIO_FROM_NUMBER.');
  }

  await client.messages.create({ from, to: toE164, body });
}
