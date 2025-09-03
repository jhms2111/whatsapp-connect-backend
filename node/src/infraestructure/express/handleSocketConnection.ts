import { Server as IOServer, Socket } from 'socket.io';
import path from 'path';

import { saveMessage } from '../mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../modules/twilio/adapter/config';
import TwilioNumber from '../mongo/models/twilioNumberModel';
import Message from '../../infraestructure/mongo/models/messageModel';

import { pausedRooms } from '../../modules/integration/application/roomManagement';
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
      setTimeout(() => socket.disconnect(true), 100);
      return;
    }
  }

  const user = new User(username, socket.id);
  users.set(socket.id, user);
  userSockets.set(username, socket.id);

  processMessageQueue(io);
  logConnectedUsers();

  // Enviar mensagem do humano para o WhatsApp
  socket.on('sendHumanMessage', async ({ roomId, message, sender }) => {
    console.log(`Mensagem enviada pelo humano: roomId=${roomId}, message=${message}, sender=${sender}`);
    if (!roomId || !message || !sender) return;

    try {
      const [clientNumber, twilioNumber] = roomId.split('___');
      if (!clientNumber || !twilioNumber) return;

      const toNumber = `+${clientNumber}`;
      const fromNumber = `whatsapp:+${twilioNumber}`;

      await sendMessageToTwilio(
        message,
        toNumber,
        fromNumber
      );

      console.log('✅ Mensagem do humano enviada ao WhatsApp via Twilio:', message);
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem do humano ao WhatsApp via Twilio:', error);
    }

    if (occupiedRooms.has(roomId)) {
      await saveMessage(roomId, sender, message, true);
    } else {
      addMessageToQueue(roomId, message, sender);
    }
  });

  socket.on('messageToRoom', async ({ roomId, message, sender }) => {
    console.log(`Evento messageToRoom recebido: roomId=${roomId}, message=${message}, sender=${sender}`);
    if (!roomId || !message || !sender) return;

    try {
      const [clientNumber] = roomId.split('-');
      const toNumber = `whatsapp:${clientNumber}`;
      const twilioNumberDoc = await TwilioNumber.findOne({ owner: username });

      if (!twilioNumberDoc) {
        console.warn(`⚠️ Usuário ${username} não tem número Twilio configurado.`);
      } else {
        const fromNumber = twilioNumberDoc.number;

        await sendMessageToTwilio(
          message,
          toNumber,
          fromNumber
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
    }
  });

  socket.on('joinRoom', async (roomId: string) => {
    console.log(`👥 Socket ${socket.id} entrou na sala ${roomId}`);
    socket.join(roomId);

    const user = users.get(socket.id);
    if (user) {
      const userRooms = userRoomConnections.get(user.username) || [];
      if (!userRooms.includes(roomId)) {
        userRooms.push(roomId);
        userRoomConnections.set(user.username, userRooms);
      }
    }

    rooms.set(roomId, socket.id);
    occupiedRooms.add(roomId);

    socket.emit('roomJoined', roomId);

    const msgs = await Message.find({ roomId }).sort({ timestamp: 1 });
    socket.emit('previousMessages', msgs);
  });

  socket.on('pauseBot', (roomId) => {
    pausedRooms.add(roomId);
    console.log(`🤖 Bot pausado para a sala ${roomId}`);
  });

  socket.on('resumeBot', (roomId) => {
    pausedRooms.delete(roomId);
    console.log(`🤖 Bot reativado para a sala ${roomId}`);
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
        }
      });
      userRoomConnections.delete(userId);
    }
    users.delete(socket.id);
    userSockets.delete(username);
    logConnectedUsers();
  });
};


