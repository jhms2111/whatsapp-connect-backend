import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';

import { saveMessage } from '../../mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

// 🔧 Garante que o diretório de uploads exista
export function ensureUploadDirExists() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

// 📁 Configuração do Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDirExists();
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/ogg',
  'audio/wav'
];

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

export function setupUploadRoutes(app: Express, io: Server): void {
  app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    const file = req.file;
    const { roomId, sender } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const fileUrl = encodeURI(`${process.env.BASE_URL}/uploads/${file.filename}`);

    try {
      // 🔎 Busca número Twilio pelo username (owner)
      const twilioEntry = await TwilioNumber.findOne({ owner: sender });
      if (!twilioEntry) {
        return res.status(404).json({ error: `Usuário ${sender} não possui número Twilio.` });
      }

      // 💾 Salva mensagem no histórico
      await saveMessage(roomId, sender, '', true, fileUrl, file.originalname);

      // 📤 Envia mensagem via Twilio com o arquivo (usando variáveis de ambiente)
      await sendMessageToTwilio(
        `Arquivo recebido: ${file.originalname}`,
        roomId,
        twilioEntry.number,
        fileUrl // Enviar com mídia
      );

      // 🔁 Emite para o front-end via socket
      io.to(roomId).emit('file message', {
        sender,
        fileName: file.originalname,
        fileUrl
      });

      res.json({ fileName: file.originalname, fileUrl });
    } catch (error) {
      console.error('[UPLOAD] Erro ao salvar/enviar arquivo:', error);
      res.status(500).json({ error: 'Erro ao salvar mensagem ou enviar mensagem via Twilio' });
    }
  });
}
