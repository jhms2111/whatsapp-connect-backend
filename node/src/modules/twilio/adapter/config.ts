
import twilio from 'twilio';

/**
 * Envia uma mensagem via Twilio com os dados fornecidos
 * 
 * @param message - O conteúdo da mensagem
 * @param roomId - Número do cliente (ex: +55999999999)
 * @param fromNumber - Número do Twilio do remetente (ex: whatsapp:+14155238886)
 * @param accountSid - SID da conta Twilio
 * @param authToken - Token da conta Twilio
 * @param mediaUrl - (opcional) URL de mídia a ser enviada
 */
export async function sendMessageToTwilio(
  message: string,
  roomId: string,
  fromNumber: string,
  accountSid: string,
  authToken: string,
  mediaUrl?: string
) {
  try {
    const client = twilio(accountSid, authToken);

    const toNumber = `whatsapp:${roomId}`;
    const mediaUrls = mediaUrl ? [mediaUrl] : [];

    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
      mediaUrl: mediaUrls,
    });

    console.log(`✅ Mensagem enviada via Twilio (${roomId}): ${msg.sid}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem para ${roomId} via Twilio:`, error);
  }
}
