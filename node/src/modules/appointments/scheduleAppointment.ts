// src/modules/appointments/scheduleAppointment.ts
import mongoose, { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';
import Appointment, { IAppointment } from '../../infraestructure/mongo/models/appointmentModel';
import ClientMemory, { IClientMemory } from '../../infraestructure/mongo/models/clientMemoryModel';

interface IAppointmentDoc extends IAppointment, mongoose.Document {
  _id: Types.ObjectId;
}

// 🔹 Função para normalizar a mensagem recebida
export const normalizeDatetimeMessage = (message: string): string => {
  let normalized = message.toLowerCase();

  // Remove acentos e caracteres especiais
  normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Substituições comuns de palavras para datas
  normalized = normalized.replace(/\bamanha\b/g, "tomorrow");
  normalized = normalized.replace(/\bhoje\b/g, "today");

  // Substituições de horas simplificadas (ex: "15h" -> "15:00")
  normalized = normalized.replace(/\b(\d{1,2})h\b/g, "$1:00");

  // Remove palavras de confirmação "sim", "ok", "por favor"
  normalized = normalized.replace(/\b(sim|ok|por favor)\b/g, "").trim();

  return normalized;
};

// 🔹 Função para parsear a data normalizada em objeto Date
export const parseNormalizedDatetime = (normalized: string): Date | null => {
  try {
    // Remove palavras extras tipo "horas"
    let clean = normalized.replace(/\bhoras\b/g, "").trim();

    // Regex para DD/MM/YYYY HH:mm ou DD/MM/YYYY HH
    const match = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})(?::(\d{2}))?/);

    if (!match) {
      return null;
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // meses começam do 0
    const year = parseInt(match[3], 10);
    const hours = parseInt(match[4], 10);
    const minutes = match[5] ? parseInt(match[5], 10) : 0;

    return new Date(year, month, day, hours, minutes);
  } catch (err) {
    return null;
  }
};


// 🔹 Função para gerar a mensagem de confirmação
export const getConfirmationMessage = (datetime: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const formatted = datetime.toLocaleString("pt-BR", options);
  return `Você confirma o agendamento para ${formatted}?`;
};

// 🔹 Salva agendamento real no MongoDB e filesystem
export const scheduleAppointment = async (
  clientId: string,
  clientName: string,
  proposedDatetime: Date,
  confirmed: boolean
) => {
  if (!confirmed) {
    return { success: false, message: 'Cliente não confirmou o horário.' };
  }

  // 🔹 Cria o agendamento no MongoDB
  const appointmentRaw = await Appointment.create({
    clientId,
    clientName,
    datetime: proposedDatetime,
    status: 'confirmed',
    createdBy: 'bot',
  });

  const appointment = appointmentRaw as IAppointmentDoc;

  // 🔹 Atualiza memória do cliente
  let clientMemory = await ClientMemory.findOne({ clientId }) as IClientMemory | null;
  if (!clientMemory) {
    clientMemory = new ClientMemory({ clientId, interactions: [], lastInteraction: new Date() });
  }

  clientMemory.interactions.push({
    sender: 'bot',
    message: `Agendamento confirmado para ${proposedDatetime.toLocaleString('pt-BR')}`,
    timestamp: new Date(),
    topics: ['scheduling'],
    sentiment: 'positive',
    appointmentId: appointment._id,
  });

  clientMemory.lastInteraction = new Date();
  await clientMemory.save();

  // 🔹 Cria pasta no filesystem para o cliente
  const clientDir = path.join(__dirname, '../../../public/uploads', clientId);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }

  return appointment;
};
