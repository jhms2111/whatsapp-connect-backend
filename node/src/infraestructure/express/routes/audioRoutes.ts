
// src/infraestructure/express/routes/audioRoutes.ts
import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { Server } from 'socket.io';
import { saveMessage } from '../../mongo/mongodbAdapter';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'; // fallback opcional


const ffmpegPath = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '..', 'bin', 'ffmpeg');
const ffprobePath = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '..', 'bin', 'ffprobe');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

export function ensureUploadDirExists() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDirExists();
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
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
    console.log('Tipo MIME do arquivo:', file.mimetype);
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

export function setupAudioRoutes(app: Express, io: Server): void {
  app.post('/uploadAudio', upload.single('audio'), async (req: Request, res: Response) => {
    const file = req.file;
    const { roomId, sender } = req.body;

    if (!file) {
      console.log('Nenhum arquivo de áudio enviado.');
      return res.status(400).json({ error: 'Nenhum arquivo de áudio enviado.' });
    }

    const originalFileUrl = encodeURI(`${BASE_URL}/uploads/${file.filename}`);

    console.log('URL do arquivo original:', originalFileUrl);

    const mp3FileName = `${file.filename.replace(/\.[^/.]+$/, '')}.mp3`;
    const mp3FilePath = path.join(uploadDir, mp3FileName);

    console.log('Iniciando conversão de:', file.path);

    ffmpeg(file.path)
      .audioCodec('libmp3lame')
      .toFormat('mp3')
      .on('end', async () => {
        console.log('Conversão concluída.');

        try {
          fs.unlinkSync(file.path); // remove o arquivo original

          const audioUrl = encodeURI(`${BASE_URL}/uploads/${mp3FileName}`);
          console.log('URL do áudio MP3:', audioUrl);

          await saveMessage(roomId, sender, '', true, audioUrl, mp3FileName);

          // 🟡 Extrai número do cliente (antes do pipe) e procura número Twilio baseado no sender
          const [clientNumber] = roomId.split('|');

          const twilioNumber = await TwilioNumber.findOne({ owner: sender });
          if (!twilioNumber) {
            console.warn(`⚠️ Sender ${sender} não tem número Twilio configurado.`);
          } else {
            await sendMessageToTwilio(
              '', // mensagem de texto vazia
              clientNumber, // destinatário (cliente)
              twilioNumber.number,
              twilioNumber.accountSid,
              twilioNumber.authToken,
              audioUrl // ✅ URL do áudio como mídia
            );
          }

          io.to(roomId).emit('audio message', {
            sender,
            fileName: mp3FileName,
            fileUrl: audioUrl
          });

          res.json({ fileName: mp3FileName, fileUrl: audioUrl });
        } catch (error) {
          console.error('Erro ao salvar mensagem no MongoDB ou enviar via Twilio:', error);
          res.status(500).json({ error: 'Erro ao salvar mensagem ou enviar via Twilio' });
        }
      })
      .on('error', (err) => {
        console.error('Erro ao converter áudio:', err);
        res.status(500).json({ error: 'Erro ao converter áudio para MP3' });
      })
      .save(mp3FilePath);
  });
}
