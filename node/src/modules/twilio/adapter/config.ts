// src/modules/twilio/adapter/config.ts
import twilio from 'twilio';

// Cria o client global uma vez com dados do .env
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

/**
 * Envia uma mensagem via Twilio com os dados fornecidos
 * 
 * @param message - O conteúdo da mensagem
 * @param roomId - Número do cliente (ex: +55999999999)
 * @param fromNumber - Número do Twilio do remetente (ex: whatsapp:+14155238886)
 * @param mediaUrl - (opcional) URL de mídia a ser enviada
 */
export async function sendMessageToTwilio(
  message: string,
  roomId: string,
  fromNumber: string,
  mediaUrl?: string
) {
  try {
    const toNumber = `whatsapp:${roomId}`;
    const mediaUrls = mediaUrl ? [mediaUrl] : [];

    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
      mediaUrl: mediaUrls.length ? mediaUrls : undefined,
    });

    console.log(`✅ Mensagem enviada via Twilio (${roomId}): ${msg.sid}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem para ${roomId} via Twilio:`, error);
  }
}
