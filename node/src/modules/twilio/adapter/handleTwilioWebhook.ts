import { Server as IOServer } from 'socket.io';
import { Request, Response } from 'express';
import path from 'path';
import { downloadFile } from './downloadFile';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import Bot from '../../../infraestructure/mongo/models/botModel';
import TwilioNumber from '../../../infraestructure/mongo/models/twilioNumberModel';
import { generateBotResponse } from '../../../modules/integration/Chatgpt/chatGptAdapter';
import {
  userSockets,
  logConnectedUsers,
} from '../../integration/damain/user';
import {
  occupiedRooms,
  connectSocketToRoom,
  simulateTwilioSocket,
} from '../../integration/application/roomManagement';
import { addMessageToQueue } from '../../integration/application/messageQueue';
import Product, { IProduct } from '../../../infraestructure/mongo/models/productModel';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export const handleTwilioWebhook = async (
  req: Request,
  res: Response,
  io: IOServer
): Promise<void> => {
  const { From, To, Body, MediaUrl0, MediaContentType0 } = req.body;
  const roomId = `${From.replace('whatsapp:', '')}___${To}`;
  const sender = `Socket-twilio-${roomId}`;

  try {
    const twilioEntry = await TwilioNumber.findOne({ number: To });
    if (!twilioEntry) {
      res.status(404).json({ error: 'Número não autorizado.' });
      return;
    }

    const twilioOwner = twilioEntry.owner;
    const bot = await Bot.findOne({ owner: twilioOwner }).populate<{ product: IProduct | IProduct[] }>('product');

    if (!bot) {
      console.warn(`[BOT] Nenhum bot encontrado para o usuário ${twilioOwner}`);
      res.status(404).send();
      return;
    }

    const products = Array.isArray(bot.product)
      ? bot.product as IProduct[]
      : [bot.product as IProduct];

    const getConnectedSocketId = (roomId: string) => {
      const sockets = Array.from(io.sockets.sockets.values());
      for (const socket of sockets) {
        if (socket.rooms.has(roomId)) return socket.id;
      }
      return null;
    };

    const handleBotAutoReply = async (message: string) => {
      try {
        const resposta = await generateBotResponse(
          bot.name ?? 'Enki',
          bot.persona ?? 'atendente simpática',
          products,
          bot.temperature ?? 0.5,
          message,
          {
            name: bot.companyName ?? 'Empresa Genérica',
            address: bot.address ?? 'Endereço não informado',
            email: bot.email ?? 'email@empresa.com',
            phone: bot.phone ?? '(00) 00000-0000',
          }
        );

        if (!resposta) return;

        await sendMessageToTwilio(
          resposta,
          From.replace('whatsapp:', ''),
          twilioEntry.number,
          twilioEntry.accountSid,
          twilioEntry.authToken
        );

        io.to(roomId).emit('twilio message', {
          sender: 'Bot',
          message: resposta,
        });

        await saveMessage(roomId, 'Bot', resposta, true);
      } catch (err) {
        console.error('[BOT] Erro ao gerar resposta do bot:', err);
      }
    };

    const handleFileMessage = async (fileUrl: string, fileName: string, fileType: string) => {
      await saveMessage(roomId, sender, '', true, fileUrl, fileName, twilioOwner);
      const socketEvent = fileType.startsWith('audio/') ? 'audio message' : 'file message';
      io.to(roomId).emit(socketEvent, {
        sender,
        fileName,
        fileUrl,
        fileType,
        source: 'twilio',
      });
    };

    const connectedSocketId = getConnectedSocketId(roomId);

    if (occupiedRooms.has(roomId)) {
      if (MediaUrl0) {
        const fileName = MediaUrl0.split('/').pop() || 'file_0';
        const filePath = path.join(uploadDir, fileName);

        try {
          await downloadFile(MediaUrl0, filePath, twilioEntry.accountSid, twilioEntry.authToken);
          const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
          const fileType = MediaContentType0 || 'application/octet-stream';

          await handleFileMessage(fileUrl, fileName, fileType);
          res.sendStatus(200);
          return;
        } catch (error) {
          console.error('[FILE] Erro ao baixar arquivo:', error);
          res.status(500).json({ error: 'Erro ao processar mídia.' });
          return;
        }
      }

      if (Body) {
        io.to(roomId).emit('twilio message', { sender, message: Body });
        await saveMessage(roomId, sender, Body, true, undefined, undefined, twilioOwner);
        await handleBotAutoReply(Body);
        res.sendStatus(200);
        return;
      }
    }

    const randomSocket = Array.from(io.sockets.sockets.values()).find((socket) => {
      return !Array.from(socket.rooms).some((room) => occupiedRooms.has(room));
    });

    if (randomSocket) {
      await connectSocketToRoom(io, randomSocket, roomId);
      simulateTwilioSocket(io, roomId);

      if (MediaUrl0) {
        const fileName = MediaUrl0.split('/').pop() || 'file_0';
        const filePath = path.join(uploadDir, fileName);

        try {
          await downloadFile(MediaUrl0, filePath, twilioEntry.accountSid, twilioEntry.authToken);
          const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
          const fileType = MediaContentType0 || 'application/octet-stream';

          await handleFileMessage(fileUrl, fileName, fileType);

          if (Body) {
            io.to(roomId).emit('twilio message', { sender, message: Body });
            await saveMessage(roomId, sender, Body, true, fileUrl, fileName, twilioOwner);
            await handleBotAutoReply(Body);
          }

          res.sendStatus(200);
          return;
        } catch (error) {
          console.error('[FILE] Erro ao baixar arquivo:', error);
          res.status(500).json({ error: 'Erro ao processar mídia.' });
          return;
        }
      }

      if (Body) {
        io.to(roomId).emit('twilio message', { sender, message: Body });
        await saveMessage(roomId, sender, Body, true, undefined, undefined, twilioOwner);
        await handleBotAutoReply(Body);
        res.sendStatus(200);
        return;
      }
    }

    if (Body) {
      addMessageToQueue(roomId, Body);
    }

    logConnectedUsers();
    res.sendStatus(200);
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
    res.status(500).json({ error: 'Erro inesperado no webhook.' });
  }
};
