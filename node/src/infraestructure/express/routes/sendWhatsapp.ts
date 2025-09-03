// src/routes/sendWhatsapp.ts

import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { Server as IOServer } from 'socket.io';

const router = Router();

// Middleware para injetar io
let io: IOServer;
export const injectSocketIO = (_io: IOServer) => {
  io = _io;
};

// Enviar mensagem do humano para o WhatsApp
router.post('/send-human-message', async (req: Request, res: Response) => {
  const { message, roomId, sender } = req.body;

  try {
    const twilioEntry = await TwilioNumber.findOne({ owner: sender });
    if (!twilioEntry) {
      return res.status(404).json({ error: 'Número Twilio não encontrado para o usuário.' });
    }

    const { number: fromNumber } = twilioEntry;
    const [clientNumber] = roomId.split('___');

    // ✅ Agora usa os dados do .env diretamente
    await sendMessageToTwilio(
      message,
      clientNumber,
      fromNumber
    );

    await saveMessage(roomId, sender, message, true);

    io.to(roomId).emit('twilio message', {
      sender,
      message,
      roomId,
      timestamp: new Date()
    });

    io.emit('historicalRoomUpdated', {
      roomId,
      lastMessage: message,
      lastTimestamp: new Date()
    });

    res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao enviar a mensagem para o WhatsApp' });
  }
});

export default router;
