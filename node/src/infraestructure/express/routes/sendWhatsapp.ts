// src/infraestructure/express/routes/sendWhatsapp.ts
import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { Server as IOServer } from 'socket.io';

const router = Router();

let io: IOServer | undefined;
export const injectSocketIO = (_io: IOServer) => { io = _io; };

router.post('/send-human-message', async (req: Request, res: Response) => {
  const { message, roomId, sender, clientMsgId } = req.body as {
    message: string; roomId: string; sender: string; clientMsgId?: string;
  };

  try {
    const twilioEntry = await TwilioNumber.findOne({ owner: sender });
    if (!twilioEntry) return res.status(404).json({ error: 'Número Twilio não encontrado para o usuário.' });

    const { number: fromNumber } = twilioEntry;
    const [clientNumberRaw] = String(roomId).split('___');
    const clientNumber = clientNumberRaw; // normalize se precisar para E164

  await sendMessageToTwilio(message, clientNumber, fromNumber);
    await saveMessage(roomId, sender, message, true);

 //   const ts = new Date().toISOString(); // <-- ISO sempre
  //  try {
    //  if (io) {
      //  io.to(roomId).emit('twilio message', {
       //   sender,
        //  message,
        //  roomId,
       //   timestamp: ts,         // <-- ISO
       //   clientMsgId: clientMsgId ?? null, // <-- ecoa o ID do cliente
    //    });
   //   }
   // } catch (e) {
    ///  console.error('[send-human-message] emit error:', e);
   // }

  //  return res.status(200).json({ ok: true, clientMsgId: clientMsgId ?? null, timestamp: ts });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao enviar a mensagem para o WhatsApp' });
  }
});

export default router;
