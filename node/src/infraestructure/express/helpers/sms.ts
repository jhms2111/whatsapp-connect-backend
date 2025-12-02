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
    throw new Error('Twilio client not configured.');
  }

  let from: string;

  // 🇧🇷 Brazil MUST use the Twilio number (no alphanumeric Sender ID)
  if (toE164.startsWith('+55')) {
    from = FROM; // number like +1415xxxx etc.
  } else {
    // Other countries can use alphanumeric if available
    from = SENDER_ID || FROM;
  }

  if (!from) {
    throw new Error('No sender configured.');
  }

  return await client.messages.create({ from, to: toE164, body });
}

