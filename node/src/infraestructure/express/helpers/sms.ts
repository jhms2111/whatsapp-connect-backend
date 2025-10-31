import twilio from 'twilio';

const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_FROM_NUMBER || '';

let client: twilio.Twilio | null = null;
if (SID && TOKEN) {
  client = twilio(SID, TOKEN);
}

export async function sendSmsE164(toE164: string, body: string) {
  if (!client) throw new Error('Twilio client não configurado.');
  if (!FROM) throw new Error('TWILIO_FROM_NUMBER ausente.');
  await client.messages.create({ from: FROM, to: toE164, body });
}
