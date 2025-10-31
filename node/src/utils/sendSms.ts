import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

const client = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

export async function sendVerificationSms(toE164: string, body: string) {
  if (!client) throw new Error('Twilio não configurado.');
  const from = TWILIO_FROM_NUMBER || '';
  return client.messages.create({ to: toE164, from, body });
}
