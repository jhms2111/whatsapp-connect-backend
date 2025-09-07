import { Types, Document } from 'mongoose';
import fs from 'fs';
import path from 'path';

import ClientMemory from '../../mongo/models/clientMemoryModel';
import Appointment, { IAppointment } from '../../mongo/models/appointmentModel';

// Novo tipo para o document retornado
interface IAppointmentDoc extends IAppointment, Document {
  _id: Types.ObjectId;
}

export const scheduleAppointment = async (
  clientId: string,
  clientName: string,
  proposedDatetime: Date,
  confirmed: boolean
) => {
  if (!confirmed) {
    return { success: false, message: 'Cliente não confirmou o horário.' };
  }

  // 🔹 Cria o agendamento
  const appointmentRaw = await Appointment.create({
    clientId,
    clientName,
    datetime: proposedDatetime,
    status: 'confirmed',
    createdBy: 'bot',
  });

  // 🔹 Faz cast seguro para nosso tipo com _id conhecido
  const appointment = appointmentRaw as IAppointmentDoc;

  // 🔹 Atualiza a memória do cliente
  const clientMemory = await ClientMemory.findOne({ clientId });
  if (clientMemory) {
    clientMemory.interactions.push({
      sender: 'bot',
      message: `Agendamento confirmado para ${proposedDatetime.toISOString()}`,
      timestamp: new Date(),
      appointmentId: appointment._id, // ✅ agora tipado
    });
    clientMemory.lastInteraction = new Date();
    await clientMemory.save();
  }

  // 🔹 Cria pasta do agendamento e salva JSON
  try {
    const basePath = path.join(__dirname, '../../appointments', clientId);
    const folderName = proposedDatetime.toISOString().replace(/:/g, '-'); // evita problemas no Windows
    const fullPath = path.join(basePath, folderName);

    fs.mkdirSync(fullPath, { recursive: true });

    const data = {
      clientId,
      clientName,
      datetime: proposedDatetime,
      status: 'confirmed',
      createdBy: 'bot',
      createdAt: new Date(),
      appointmentId: appointment._id.toHexString(), // ✅ converte para string
    };

    fs.writeFileSync(path.join(fullPath, 'info.json'), JSON.stringify(data, null, 2));
    console.log('✅ Arquivo do agendamento criado:', fullPath);
  } catch (err) {
    console.error('❌ Erro ao criar pasta do agendamento:', err);
  }

  return { success: true, appointment };
};
