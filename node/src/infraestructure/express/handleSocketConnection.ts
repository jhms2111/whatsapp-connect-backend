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
  // também aceita username via handshake.auth
  const incomingAuthUser = (socket.handshake?.auth as any)?.username;
  const username = (socket.data as any)?.username || incomingAuthUser || 'Anônimo';
  console.log(`Socket conectado: ${socket.id}, usuário: ${username}`);

  // ===== Controle de sessão única por usuário =====
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

  // ===== Salas =====
  socket.on('joinRoom', async (roomId: string) => {
    if (!roomId) return;
    console.log(`👥 Socket ${socket.id} entrou na sala ${roomId}`);
    socket.join(roomId);

    const curr = users.get(socket.id);
    if (curr) {
      const userRooms = userRoomConnections.get(curr.username) || [];
      if (!userRooms.includes(roomId)) {
        userRooms.push(roomId);
        userRoomConnections.set(curr.username, userRooms);
      }
    }

    rooms.set(roomId, socket.id);
    occupiedRooms.add(roomId);

    socket.emit('roomJoined', roomId);

    // Envia histórico
    try {
      const msgs = await Message.find({ roomId }).sort({ timestamp: 1 });
      socket.emit('previousMessages', msgs);
    } catch (e) {
      console.error('Erro ao carregar mensagens anteriores:', e);
    }
  });

  socket.on('leaveRoom', (roomId: string) => {
    if (!roomId) return;
    console.log(`👋 Socket ${socket.id} saiu da sala ${roomId}`);
    socket.leave(roomId);
  });

  // ===== Bot on/off =====
  socket.on('pauseBot', (roomId: string) => {
    if (!roomId) return;
    pausedRooms.add(roomId);
    console.log(`🤖 Bot pausado para a sala ${roomId}`);
  });

  socket.on('resumeBot', (roomId: string) => {
    if (!roomId) return;
    pausedRooms.delete(roomId);
    console.log(`🤖 Bot reativado para a sala ${roomId}`);
  });

  // compat com nomes modernos
  socket.on('webchatPauseBot', (roomId: string) => {
    if (!roomId) return;
    pausedRooms.add(roomId);
    console.log(`🤖 (webchat) Bot pausado para a sala ${roomId}`);
  });
  socket.on('webchatResumeBot', (roomId: string) => {
    if (!roomId) return;
    pausedRooms.delete(roomId);
    console.log(`🤖 (webchat) Bot reativado para a sala ${roomId}`);
  });

  // ============================================================================
  //                            EVENTOS ATUAIS (WEBCHAT)
  // ============================================================================

  // Texto humano (evento atual do front)
  socket.on('webchatSendMessage', async ({ roomId, message, sender, timestamp }: {
    roomId: string; message: string; sender: string; timestamp?: string;
  }) => {
    if (!roomId || !message || !sender) return;

    const payload = {
      roomId,
      message,
      sender,
      timestamp: timestamp || new Date().toISOString(),
      sent: true, // <<< painel/atendente envia
    };

    try {
      // pega o _id salvo para dedupe no cliente
      const saved = await Message.create(payload);
      const emitted = { ...payload, _id: saved._id };
      io.to(roomId).emit('webchat message', emitted);
    } catch (e) {
      console.error('Erro ao salvar webchatSendMessage:', e);
      // ainda assim emitimos algo (sem _id) para não perder UX
      io.to(roomId).emit('webchat message', payload);
    }
  });

  // Arquivo humano (evento atual do front)
  socket.on('webchatSendFile', async ({ roomId, fileUrl, fileName, sender, timestamp }: {
    roomId: string; fileUrl: string; fileName?: string; sender: string; timestamp?: string;
  }) => {
    if (!roomId || !fileUrl || !sender) return;

    const payload = {
      roomId,
      fileUrl,
      fileName,
      sender,
      timestamp: timestamp || new Date().toISOString(),
      sent: true, // <<<
    };

    try {
      const saved = await Message.create(payload);
      const emitted = { ...payload, _id: saved._id };
      io.to(roomId).emit('webchat file', emitted);
    } catch (e) {
      console.error('Erro ao salvar webchatSendFile:', e);
      io.to(roomId).emit('webchat file', payload);
    }
  });

  // Áudio humano (evento atual do front)
  socket.on('webchatSendAudio', async ({ roomId, audioUrl, sender, timestamp }: {
    roomId: string; audioUrl: string; sender: string; timestamp?: string;
  }) => {
    if (!roomId || !audioUrl || !sender) return;

    const payload = {
      roomId,
      audioUrl,
      sender,
      timestamp: timestamp || new Date().toISOString(),
      sent: true, // <<<
    };

    try {
      const saved = await Message.create(payload);
      const emitted = { ...payload, _id: saved._id };
      io.to(roomId).emit('webchat audio', emitted);
    } catch (e) {
      console.error('Erro ao salvar webchatSendAudio:', e);
      io.to(roomId).emit('webchat audio', payload);
    }
  });

  // ============================================================================
  //                         FALLBACKS LEGADOS (SE USADOS)
  // ============================================================================

  socket.on('sendHumanMessage', async ({ roomId, message, sender }: {
    roomId: string; message: string; sender: string;
  }) => {
    console.log(`Mensagem enviada pelo humano: roomId=${roomId}, message=${message}, sender=${sender}`);
    if (!roomId || !message || !sender) return;

    // 1) Envio ao WhatsApp via Twilio (mantido)
    try {
      const partsUnderscore = roomId.split('___');
      if (partsUnderscore.length === 2) {
        const [clientNumber, twilioNumber] = partsUnderscore;
        const toNumber = `+${clientNumber}`;
        const fromNumber = `whatsapp:+${twilioNumber}`;
        await sendMessageToTwilio(message, toNumber, fromNumber);
      } else {
        const [clientNumber] = roomId.split('-');
        if (clientNumber) {
          const toNumber = `whatsapp:${clientNumber}`;
          const twilioNumberDoc = await TwilioNumber.findOne({ owner: username });
          if (twilioNumberDoc?.number) {
            const fromNumber = twilioNumberDoc.number;
            await sendMessageToTwilio(message, toNumber, fromNumber);
          } else {
            console.warn(`⚠️ Usuário ${username} não tem número Twilio configurado.`);
          }
        }
      }
      console.log('✅ Mensagem do humano enviada ao WhatsApp via Twilio:', message);
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem do humano ao WhatsApp via Twilio:', error);
      // continua o fluxo: queremos persistir/emitir no chat mesmo se Twilio falhar
    }

    // 2) SEMPRE persistir no histórico do WebChat (mesmo se sala não ocupada)
    const payload = {
      roomId,
      message,
      sender,
      timestamp: new Date().toISOString(),
      sent: true, // <<< painel/atendente envia
    };

    let emittedPayload: any = payload;
    try {
      const saved = await Message.create(payload);
      emittedPayload = { ...payload, _id: saved._id };
    } catch (e) {
      console.error('Erro ao salvar sendHumanMessage no Message (WebChat histórico):', e);
    }

    // 3) Fluxo legado mantido (ocupada => saveMessage; vazia => fila)
    try {
      if (occupiedRooms.has(roomId)) {
        await saveMessage(roomId, sender, message, true);
      } else {
        addMessageToQueue(roomId, message, sender);
      }
    } catch (e) {
      console.error('Erro no fluxo legado de armazenamento/fila do sendHumanMessage:', e);
    }

    // 4) Emitir para os clientes
    io.to(roomId).emit('twilio message', emittedPayload);
  });

  socket.on('sendFileMessage', async ({ roomId, fileUrl, fileName, sender }: {
    roomId: string; fileUrl: string; fileName?: string; sender: string;
  }) => {
    if (!roomId || !fileUrl || !sender) return;
    const payload = { roomId, fileUrl, fileName, sender, timestamp: new Date().toISOString(), sent: true };

    try {
      const saved = await Message.create(payload);
      const emitted = { ...payload, _id: saved._id };
      io.to(roomId).emit('file message', emitted);
    } catch (e) {
      console.error('Erro ao salvar sendFileMessage:', e);
      io.to(roomId).emit('file message', payload);
    }
  });

  socket.on('sendAudioMessage', async ({ roomId, audioUrl, sender }: {
    roomId: string; audioUrl: string; sender: string;
  }) => {
    if (!roomId || !audioUrl || !sender) return;
    const payload = { roomId, audioUrl, sender, timestamp: new Date().toISOString(), sent: true };

    try {
      const saved = await Message.create(payload);
      const emitted = { ...payload, _id: saved._id };
      io.to(roomId).emit('audio message', emitted);
    } catch (e) {
      console.error('Erro ao salvar sendAudioMessage:', e);
      io.to(roomId).emit('audio message', payload);
    }
  });

  // ===== Disconnect =====
  socket.on('disconnect', () => {
    console.log('⛔ Socket desconectado:', socket.id);
    const u = users.get(socket.id);
    if (u) {
      const userId = u.username;
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
