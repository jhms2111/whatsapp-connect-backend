// src/modules/twilio/adapter/config.ts
import twilio from 'twilio';

// Cria o client global uma vez com dados do .env
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

/** =================== Normalização WhatsApp =================== */
function asWhatsapp(input: string): string {
  const s = String(input ?? '').trim();
  if (!s) return 'whatsapp:+';

  // já está no formato whatsapp:
  if (s.startsWith('whatsapp:')) {
    const rest = s.slice('whatsapp:'.length).trim();
    // whatsapp:+E164
    if (rest.startsWith('+')) return `whatsapp:${rest}`;
    // whatsapp:551199... => converte pra whatsapp:+551199...
    return `whatsapp:+${rest.replace(/\D/g, '')}`;
  }

  // veio +E164
  if (s.startsWith('+')) return `whatsapp:${s}`;

  // veio "cru" (só dígitos ou com lixo)
  return `whatsapp:+${s.replace(/\D/g, '')}`;
}
/** ============================================================= */

/**
 * Envia uma mensagem via Twilio (WhatsApp)
 *
 * @param message - O conteúdo da mensagem
 * @param to - Destino (pode ser: "whatsapp:+E164", "+E164" ou "E164 sem +")
 * @param from - Remetente Twilio (pode ser: "whatsapp:+E164", "+E164" ou "E164 sem +")
 * @param mediaUrl - (opcional) URL de mídia a ser enviada
 */
export async function sendMessageToTwilio(
  message: string,
  to: string,
  from: string,
  mediaUrl?: string
) {
  try {
    const toNumber = asWhatsapp(to);
    const fromNumber = asWhatsapp(from);
    const mediaUrls = mediaUrl ? [mediaUrl] : undefined;

    // 🔎 debug: isso ajuda MUITO a ver formato final
    console.log('[Twilio sendMessageToTwilio] sending:', { toNumber, fromNumber, hasMedia: !!mediaUrl });

    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
      mediaUrl: mediaUrls,
    });

    console.log(`✅ Mensagem enviada via Twilio (${toNumber}) sid=${msg.sid}`);
    return msg;
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem via Twilio:`, error);
    throw error; // <-- importante: deixa o caller tratar se quiser
  }
}
