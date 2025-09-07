// src/modules/integration/Chatgpt/chatGptAdapter.ts
import { OpenAI } from 'openai';
import ClientMemory from '../../../infraestructure/mongo/models/clientMemoryModel';
import Appointment from '../../../infraestructure/mongo/models/appointmentModel';
import { scheduleAppointment } from '../../appointments/scheduleAppointment';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ===================== INTERFACES =====================
interface Product {
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
}

interface CompanyData {
  name: string;
  address: string;
  email: string;
  phone: string;
}

// ===================== FUNÇÕES AUXILIARES =====================

// 1️⃣ Salva interação na memória do cliente
const saveClientInteraction = async (
  clientId: string,
  sender: 'client' | 'bot',
  message: string
) => {
  const memory = await ClientMemory.findOne({ clientId });

  if (memory) {
    memory.interactions.push({ sender, message, timestamp: new Date() });
    memory.lastInteraction = new Date();
    await memory.save();
  } else {
    await ClientMemory.create({
      clientId,
      interactions: [{ sender, message, timestamp: new Date() }],
      lastInteraction: new Date(),
    });
  }
};

// 2️⃣ Verifica se o cliente confirmou o agendamento
const clientConfirmsAppointment = (message: string): boolean => {
  const confirmations = ['sim', 'confirmo', 'perfeito', 'ok', 'combinei', 'confirmar'];
  const msgLower = message.toLowerCase();
  return confirmations.some(word => msgLower.includes(word));
};

// 3️⃣ Extrai a data/hora da mensagem do cliente (dd/mm/yyyy hh[:mm], hh, hh h, hh horas)
const extractDatetime = (message: string): Date | null => {
  // aceita "21/11/2025 17", "21/11/2025 17h", "21/11/2025 17 horas", "21/11/2025 17:00"
  const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2})(?:[:h](\d{2}))?(?:\s*horas?)?/i;
  const match = message.match(regex);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = match[5] ? Number(match[5]) : 0;

  return new Date(year, month - 1, day, hour, minute);
};

// 4️⃣ (NOVA) Recupera a última data/hora pendente das interações salvas
const findPendingDatetimeFromMemory = (clientMemory: any): Date | null => {
  if (!clientMemory?.interactions?.length) return null;

  // percorre do fim pro começo
  const interactions = [...clientMemory.interactions].reverse();

  // 1) tenta extrair do último marcador @@DATETIME@@ do bot
  for (const it of interactions) {
    if (it.sender === 'bot' && typeof it.message === 'string' && it.message.includes('@@DATETIME@@')) {
      const m = it.message.match(/@@DATETIME@@\s*([^@]+?)\s*@@DATETIME@@/);
      if (m) {
        // normaliza "21/11/2025, 17:00" -> "21/11/2025 17:00"
        const raw = m[1].replace(',', '').trim();
        const d = extractDatetime(raw);
        if (d) return d;
      }
    }
  }

  // 2) se não achar, tenta extrair da última mensagem do cliente que tenha data
  for (const it of interactions) {
    if (it.sender === 'client' && typeof it.message === 'string') {
      const d = extractDatetime(it.message);
      if (d) return d;
    }
  }

  return null;
};

// 5️⃣ Tenta agendar automaticamente (atualizado para confirmar sem repetir a data)
const tryScheduleAppointment = async (
  clientId: string,
  userInput: string,
  clientMemory: any
) => {
  const possibleDatetimeInMessage = extractDatetime(userInput);
  const isConfirm = clientConfirmsAppointment(userInput);

  // Checa se já existe agendamento confirmado
  const existingAppointment = await Appointment.findOne({ clientId, status: 'confirmed' });
  if (existingAppointment) return;

  // Se a mensagem atual É confirmação mas NÃO contém data -> usar a última pendente da memória
  if (!possibleDatetimeInMessage && isConfirm) {
    const pending = findPendingDatetimeFromMemory(clientMemory);
    if (pending) {
      const clientName = clientMemory?.name || 'Cliente';
      try {
        await scheduleAppointment(clientId, clientName, pending, true);
        await saveClientInteraction(
          clientId,
          'bot',
          `✅ Agendamento confirmado para ${pending.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
        );
      } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        await saveClientInteraction(
          clientId,
          'bot',
          '❌ Ocorreu um erro ao criar o agendamento. Tente novamente mais tarde.'
        );
      }
      return;
    }
  }

  // Se não encontrou data/hora na mensagem e também não é confirmação, pedir no formato correto
  if (!possibleDatetimeInMessage) {
    await saveClientInteraction(
      clientId,
      'bot',
      'Não consegui identificar a data/hora. Por favor, escreva no formato "14/10/2025 9" (ou "14/10/2025 9h" / "14/10/2025 09:00").'
    );
    return;
  }

  // Se encontrou data/hora mas ainda não confirmou -> perguntar confirmação
  if (!isConfirm) {
    const formattedDate = possibleDatetimeInMessage.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    await saveClientInteraction(
      clientId,
      'bot',
      `@@DATETIME@@ ${formattedDate} @@DATETIME@@\nVocê confirma seu agendamento para essa data/hora? Responda "confirmar" para confirmar.`
    );
    return;
  }

  // Se confirmou e temos a data na mesma mensagem -> criar o agendamento
  const clientName = clientMemory?.name || 'Cliente';
  try {
    await scheduleAppointment(clientId, clientName, possibleDatetimeInMessage, true);
    await saveClientInteraction(
      clientId,
      'bot',
      `✅ Agendamento confirmado para ${possibleDatetimeInMessage.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
    );
  } catch (err) {
    console.error('Erro ao criar agendamento:', err);
    await saveClientInteraction(
      clientId,
      'bot',
      '❌ Ocorreu um erro ao criar o agendamento. Tente novamente mais tarde.'
    );
  }
};

// ===================== FUNÇÃO PRINCIPAL =====================
export const generateBotResponse = async (
  botName: string,
  persona: string,
  products: Product[],
  temperature: number,
  userInput: string,
  companyData: CompanyData,
  clientId: string
): Promise<string> => {

  // 1️⃣ Salva mensagem do cliente
  await saveClientInteraction(clientId, 'client', userInput);

  // 2️⃣ Recupera memória do cliente
  const clientMemory = await ClientMemory.findOne({ clientId });

  let memoryContext = '';
  if (clientMemory) {
    memoryContext = `Últimas 5 interações:\n${clientMemory.interactions
      .slice(-5)
      .map((i: any) => `[${i.timestamp.toISOString()}] ${i.sender}: ${i.message}`)
      .join('\n')}`;
  }

  // 3️⃣ Descrição dos produtos
  const productDescriptions = products
    .map(p => `📦 ${p.name} - ${p.description} (Preço: R$${p.priceMin} - R$${p.priceMax})`)
    .join('\n');

  // 4️⃣ Monta prompt para GPT
  const prompt = `
🧠 Contexto da empresa:
🏢 ${companyData.name}
📍 ${companyData.address}
📧 ${companyData.email}
📞 ${companyData.phone}

🛒 Produtos disponíveis:
${productDescriptions}

${memoryContext}

⚠️ Instruções:
- Seja amigável e conciso.
- Se houver data/hora, apenas repita no formato dd/mm/aaaa hh. Essa será uma mensagem "especial".
- Pergunte confirmação de agendamento apenas quando necessário.

🗣️ Cliente: "${userInput}"

Responda como ${botName}, persona: ${persona}.
`;

  // 5️⃣ Gera resposta do GPT
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userInput },
    ],
    temperature,
    max_tokens: 200,
  });

  const botResponse = response.choices[0].message?.content;
  if (!botResponse) throw new Error('GPT response was empty.');

  // 6️⃣ Salva resposta do bot
  await saveClientInteraction(clientId, 'bot', botResponse);

  // 7️⃣ Tenta criar agendamento automaticamente (com as melhorias)
  await tryScheduleAppointment(clientId, userInput, clientMemory);

  return botResponse;
};
