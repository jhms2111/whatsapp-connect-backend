// routes/sendWhatsapp.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const TwilioNumber = require('../../mongo/models/twilioNumberModel');
const { sendMessageToTwilio } = require('../../../modules/twilio/adapter/');

// POST /api/send-whatsapp
router.post('/send-whatsapp', authenticateJWT, async (req, res) => {
  const { userMessage, roomId } = req.body;
  const username = req.user?.username;

  if (!userMessage || !roomId) {
    return res.status(400).json({ error: 'Mensagem e roomId são obrigatórios.' });
  }

  try {
    const twilioNumber = await TwilioNumber.findOne({ owner: username });
    if (!twilioNumber) {
      return res.status(404).json({ error: 'Número Twilio não encontrado para este usuário.' });
    }

    const [clientNumber] = roomId.split('-');
    if (!clientNumber) {
      return res.status(400).json({ error: 'Número do cliente inválido no roomId.' });
    }

    const toNumber = `whatsapp:${clientNumber}`;
    const fromNumber = twilioNumber.number;

    await sendMessageToTwilio(
      userMessage,
      toNumber,
      fromNumber,
      twilioNumber.accountSid,
      twilioNumber.authToken
    );

    return res.status(200).json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (err) {
    console.error('[❌] Erro ao enviar WhatsApp:', err.message);
    return res.status(500).json({ error: 'Erro ao enviar WhatsApp' });
  }
});

module.exports = router;
