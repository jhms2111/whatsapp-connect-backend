import { Router } from 'express';
import { scheduleAppointment, normalizeDatetimeMessage, parseNormalizedDatetime, getConfirmationMessage } from '../../../modules/appointments/scheduleAppointment';
import ClientMemory from '../../../infraestructure/mongo/models/clientMemoryModel';

const router = Router();

// Etapa 1: cliente envia a data/hora
router.post('/request', async (req, res) => {
  const { clientId, clientName, message } = req.body;

  if (!clientId || !message) {
    return res.status(400).json({ error: 'clientId e message são obrigatórios.' });
  }

  const normalized = normalizeDatetimeMessage(message);
  if (!normalized) {
    return res.status(400).json({ error: 'Não consegui entender a data/hora.' });
  }

  const proposedDatetime = parseNormalizedDatetime(normalized);
  if (!proposedDatetime) {
    return res.status(400).json({ error: 'Data/hora inválida.' });
  }

  // Salva no ClientMemory que o bot respondeu com confirmação
  let clientMemory = await ClientMemory.findOne({ clientId });
  if (!clientMemory) {
    clientMemory = new ClientMemory({ clientId, interactions: [], lastInteraction: new Date() });
  }

  const botMessage = getConfirmationMessage(proposedDatetime);

  clientMemory.interactions.push({
    sender: 'bot',
    message: botMessage,
    timestamp: new Date(),
    topics: ['scheduling'],
    sentiment: 'positive',
  });

  clientMemory.lastInteraction = new Date();
  await clientMemory.save();

  res.status(200).json({ success: true, botMessage });
});

// Etapa 2: cliente envia "confirmar"
router.post('/confirm', async (req, res) => {
  const { clientId, clientName, message } = req.body;

  if (!clientId || message.toLowerCase() !== 'confirmar') {
    return res.status(400).json({ error: 'Envie "confirmar" para registrar o agendamento.' });
  }

  // Busca a última interação do bot com horário padronizado
  const clientMemory = await ClientMemory.findOne({ clientId });
  if (!clientMemory) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const lastBotInteraction = [...clientMemory.interactions].reverse().find(
    i => i.sender === 'bot' && i.topics?.includes('scheduling')
  );
  if (!lastBotInteraction) return res.status(400).json({ error: 'Nenhum horário a confirmar.' });

  // Extrai o horário do texto do bot
  const datetimeMatch = lastBotInteraction.message.match(/(\d{2})\/(\d{2})\/(\d{4}) às (\d{2}):00/);
  if (!datetimeMatch) return res.status(400).json({ error: 'Não consegui extrair o horário do bot.' });

  const [_, day, month, year, hour] = datetimeMatch;
  const proposedDatetime = new Date(Number(year), Number(month) - 1, Number(day), Number(hour));

  // ✅ Aqui passamos true no confirmed
  const appointment = await scheduleAppointment(clientId, clientName || '', proposedDatetime, true);

  res.status(200).json({ success: true, appointment });
});

export default router;
