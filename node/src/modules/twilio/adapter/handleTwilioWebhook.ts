// src/integration/handleTwilioWebhook.ts

import { Server as IOServer } from 'socket.io';
import { Request, Response } from 'express';
import path from 'path';
import { downloadFile } from './downloadFile';
import { saveMessage } from '../../../infraestructure/mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import Bot from '../../../infraestructure/mongo/models/botModel';
import TwilioNumber from '../../../infraestructure/mongo/models/twilioNumberModel';
import Message from '../../../infraestructure/mongo/models/messageModel';
import { generateBotResponse } from '../../../modules/integration/Chatgpt/chatGptAdapter';
import {
  occupiedRooms,
  simulateTwilioSocket,
  pausedRooms,
} from '../../integration/application/roomManagement';
import Product, { IProduct } from '../../../infraestructure/mongo/models/productModel';

export const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export const handleTwilioWebhook = async (
  req: Request,
  res: Response,
  io: IOServer
): Promise<void> => {
  const { From, To, Body, MediaUrl0, MediaContentType0 } = req.body;

  // Limpeza de números
  const fromClean = From.replace('whatsapp:', '').replace(/\W/g, '');
  const toClean = To.replace('whatsapp:', '').replace(/\W/g, '');
  const roomId = `${fromClean}___${toClean}`;
  const sender = `Socket-twilio-${roomId}`;

  // Definindo clientId único para memória do cliente
  const clientId = fromClean;

  try {
    // Verifica se o número Twilio é autorizado
    const twilioEntry = await TwilioNumber.findOne({ number: To });
    if (!twilioEntry) {
      res.status(404).json({ error: 'Número não autorizado.' });
      return;
    }

    const twilioOwner = twilioEntry.owner;

    // Busca bot do proprietário
    const bot = await Bot.findOne({ owner: twilioOwner }).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) {
      res.status(404).send();
      return;
    }

    // Normaliza produtos
    const products: IProduct[] = Array.isArray(bot.product)
      ? bot.product as IProduct[]
      : [bot.product as IProduct];

    // Função para gerar resposta do bot
    const replyWithBot = async (message: string) => {
      const resposta = await generateBotResponse(
        bot.name ?? 'Enki',
        bot.persona ?? 'atendente simpática',
        products,
        bot.temperature ?? 0.5,
        message,
        {
          name: bot.companyName ?? 'Empresa',
          address: bot.address ?? 'Endereço',
          email: bot.email ?? 'email@empresa.com',
          phone: bot.phone ?? '(00) 00000-0000',
        },
        clientId // ✅ 7º argumento corrigido
      );

      if (!resposta) return;

      await sendMessageToTwilio(
        resposta,
        From.replace('whatsapp:', ''),
        To
      );

      // Envia mensagem via socket.io
      io.to(roomId).emit('twilio message', { sender: 'Bot', message: resposta });
      await saveMessage(roomId, 'Bot', resposta, true);

      io.emit('historicalRoomUpdated', {
        roomId,
        lastMessage: resposta,
        lastTimestamp: new Date()
      });
    };

    // Função para envio de arquivos
    const sendFile = async () => {
      const fileName = MediaUrl0.split('/').pop() || 'file_0';
      const filePath = path.join(uploadDir, fileName);

      await downloadFile(MediaUrl0, filePath);

      const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${fileName}`);
      const fileType = MediaContentType0 || 'application/octet-stream';

      await saveMessage(roomId, sender, '', true, fileUrl, fileName, twilioOwner);

      const socketEvent = fileType.startsWith('audio/') ? 'audio message' : 'file message';
      io.to(roomId).emit(socketEvent, {
        sender,
        fileName,
        fileUrl,
        fileType,
        source: 'twilio'
      });

      io.emit('historicalRoomUpdated', {
        roomId,
        lastMessage: fileName,
        lastTimestamp: new Date()
      });
    };

    // Marca a sala como ocupada
    if (!occupiedRooms.has(roomId)) {
      occupiedRooms.add(roomId);
      simulateTwilioSocket(io, roomId);
    }

    // Salva mensagem de texto recebida
    if (Body) {
      io.to(roomId).emit('twilio message', { sender, message: Body });
      await saveMessage(roomId, sender, Body, true, undefined, undefined, twilioOwner);

      io.emit('historicalRoomUpdated', {
        roomId,
        lastMessage: Body,
        lastTimestamp: new Date()
      });
    }

    // Salva arquivo se houver
    if (MediaUrl0) {
      await sendFile();
    }

    // Responde via bot se a sala não estiver pausada
    if (Body && !pausedRooms.has(roomId)) {
      await replyWithBot(Body);
    } else if (pausedRooms.has(roomId)) {
      console.log(`🤖 Bot está pausado para a sala ${roomId}, nenhuma resposta será enviada.`);
    }

   // res.sendStatus(200);
  } catch (error) {
    console.error('[WEBHOOK] Erro inesperado:', error);
  //  res.status(500).json({ error: 'Erro inesperado no webhook.' });
  }
};
