// src/routes/sendWhatsapp.ts

import { Router, Request, Response } from 'express';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';

const router = Router();

// Enviar mensagem do humano para o WhatsApp
router.post('/send-human-message', async (req: Request, res: Response) => {
  const { message, roomId, sender } = req.body;
  
  try {
    // Extrair o número Twilio associado ao remetente
    const twilioEntry = await TwilioNumber.findOne({ owner: sender });
    if (!twilioEntry) {
      return res.status(404).json({ error: 'Número Twilio não encontrado para o usuário.' });
    }

    const { number: fromNumber, accountSid, authToken } = twilioEntry;

    // O número de destino será o número do cliente (roomId)
    const [clientNumber, twilioNumber] = roomId.split('-');

    // Enviar a mensagem para o WhatsApp
    await sendMessageToTwilio(
      message,
      clientNumber,
      fromNumber,
      accountSid,
      authToken
    );

    res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao enviar a mensagem para o WhatsApp' });
  }
});

export default router;
