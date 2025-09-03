// src/modules/twilio/adapter/downloadFile.ts

import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

// Garante que as variáveis do .env estejam carregadas
dotenv.config();

/**
 * Baixa um arquivo da URL fornecida e salva no destino especificado.
 * A autenticação usa o TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN do .env.
 * 
 * @param url - URL do arquivo (ex: Twilio MediaUrl)
 * @param dest - Caminho local onde o arquivo será salvo
 */
export const downloadFile = async (url: string, dest: string): Promise<void> => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
      }
    });

    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      response.data.pipe(file);
      file.on('finish', () => resolve());
      file.on('error', (err) => reject(err));
    });
  } catch (error) {
    console.error('❌ Erro ao baixar o arquivo:', error);
    throw error;
  }
};
