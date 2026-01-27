// src/infraestructure/express/routes/sendWhatsapp.ts
import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { Server as IOServer } from 'socket.io';

const router = Router();

let io: IOServer | undefined;
export const injectSocketIO = (_io: IOServer) => { io = _io; };

/** =================== Normalização WhatsApp =================== */
function asWhatsapp(input: string): string {
  const s = String(input ?? '').trim();
  if (!s) return 'whatsapp:+';

  if (s.startsWith('whatsapp:')) {
    const rest = s.slice('whatsapp:'.length).trim();
    if (rest.startsWith('+')) return `whatsapp:${rest}`;
    return `whatsapp:+${rest.replace(/\D/g, '')}`;
  }

  if (s.startsWith('+')) return `whatsapp:${s}`;
  return `whatsapp:+${s.replace(/\D/g, '')}`;
}
/** ============================================================= */

router.post('/send-human-message', async (req: Request, res: Response) => {
  const { message, roomId, sender, clientMsgId } = req.body as {
    message: string; roomId: string; sender: string; clientMsgId?: string;
  };

  try {
    if (!message || !roomId || !sender) {
      return res.status(400).json({ error: 'Campos obrigatórios: message, roomId, sender.' });
    }

    // Pega o "from" (número Twilio) do dono do painel
    const twilioEntry = await TwilioNumber.findOne({ owner: sender }).lean();
    if (!twilioEntry?.number) {
      return res.status(404).json({ error: 'Número Twilio não encontrado para o usuário.' });
    }

    // roomId padrão: clientNumber___twilioNumber
    const [clientNumberRaw] = String(roomId).split('___');

    // ✅ Normaliza TO/FROM para WhatsApp
    const toNumber = asWhatsapp(clientNumberRaw);
    const fromNumber = asWhatsapp(twilioEntry.number);

    // 🔎 debug útil
    console.log('[send-human-message] sending via Twilio:', { to: toNumber, from: fromNumber });

    await sendMessageToTwilio(message, toNumber, fromNumber);
    await saveMessage(roomId, sender, message, true);

    // (Opcional) emitir no socket se quiser
    // const ts = new Date().toISOString();
    // if (io) {
    //   io.to(roomId).emit('twilio message', {
    //     sender,
    //     message,
    //     roomId,
    //     timestamp: ts,
    //     clientMsgId: clientMsgId ?? null,
    //   });
    // }
    // return res.status(200).json({ ok: true, clientMsgId: clientMsgId ?? null, timestamp: ts });

    return res.status(200).json({ ok: true, clientMsgId: clientMsgId ?? null });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao enviar a mensagem para o WhatsApp' });
  }
});

export default router;
