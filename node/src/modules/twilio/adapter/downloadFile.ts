import axios from 'axios';
import fs from 'fs';

export const downloadFile = async (url: string, dest: string, accountSid: string, authToken: string) => {
  try {
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
    console.error('Erro ao baixar o arquivo:', error);
    throw error;
  }
};
