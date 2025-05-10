import { Server as IOServer, Socket } from 'socket.io';
import path from 'path';

import { saveMessage } from '../mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../modules/twilio/adapter/config';
import TwilioNumber from '../mongo/models/twilioNumberModel';

import {
  User,
  users,
  userSockets,
  userRoomConnections,
  logConnectedUsers
} from '../../modules/integration/damain/user';
import {
  rooms,
  occupiedRooms
} from '../../modules/integration/application/roomManagement';
import {
  processMessageQueue,
  addMessageToQueue
} from '../../modules/integration/application/messageQueue';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export const handleSocketConnection = (socket: Socket, io: IOServer) => {
  const username = socket.data.username || 'Anônimo';
  console.log(`Socket conectado: ${socket.id}, usuário: ${username}`);

  if (userSockets.has(username)) {
    const existingSocketId = userSockets.get(username);
    if (existingSocketId && existingSocketId !== socket.id) {
      console.warn(`⚠️ Usuário ${username} já está conectado no socket ${existingSocketId}. Bloqueando duplicação.`);
      socket.emit('chat_already_open', {
        message: 'Você já está com um chat aberto. Feche o anterior antes de iniciar outro.',
      });
      setTimeout(() => {
        socket.disconnect(true);
      }, 100);
      return;
    }
  }

  const user = new User(username, socket.id);
  users.set(socket.id, user);
  userSockets.set(username, socket.id);

  processMessageQueue(io);
  logConnectedUsers();

  socket.on('messageToRoom', async ({ roomId, message, sender }) => {
    console.log(`Evento messageToRoom recebido: roomId=${roomId}, message=${message}, sender=${sender}`);
    if (!roomId || !message || !sender) {
      console.error(`roomId, mensagem ou remetente inválidos. roomId: ${roomId}, mensagem: ${message}, remetente: ${sender}`);
      return;
    }

    try {
      const twilioNumber = await TwilioNumber.findOne({ owner: username });

      if (!twilioNumber) {
        console.warn(`⚠️ Usuário ${username} não tem número Twilio configurado.`);
      } else {
        const [clientNumber, twilioNumberOnly] = roomId.split('-'); // Ex: "+5511999999999-+14155238886"

        const toNumber = `whatsapp:${clientNumber}`; // Destinatário
        const fromNumber = twilioNumber.number;       // Remetente

        await sendMessageToTwilio(
          message,
          toNumber,
          fromNumber,
          twilioNumber.accountSid,
          twilioNumber.authToken
        );

        console.log('✅ Mensagem enviada ao WhatsApp via Twilio:', message);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem ao WhatsApp via Twilio:', error);
    }

    if (occupiedRooms.has(roomId)) {
      await saveMessage(roomId, sender, message, true);
    } else {
      addMessageToQueue(roomId, message, sender);
      console.log(`📩 Mensagem adicionada à fila para a sala ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('⛔ Socket desconectado:', socket.id);
    const user = users.get(socket.id);
    if (user) {
      const userId = user.username;
      const roomsConnected = userRoomConnections.get(userId) || [];
      roomsConnected.forEach(roomId => {
        if (rooms.get(roomId) === socket.id) {
          rooms.delete(roomId);
          occupiedRooms.delete(roomId);
          console.log(`📤 Sala ${roomId} liberada.`);
        }
      });
      userRoomConnections.delete(userId);
    }
    users.delete(socket.id);
    userSockets.delete(username);
    logConnectedUsers();
  });
};
