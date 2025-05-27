import { Router } from 'express';
import Message from '../../mongo/models/messageModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import jwt from 'jsonwebtoken';

const router = Router();

const getUsernameFromToken = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(' ')[1];
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
    return decoded.username as string;
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return null;
  }
};

router.get('/historical-rooms', async (req, res) => {
  const username = getUsernameFromToken(req);
  if (!username) return res.status(401).json({ error: 'Token inválido ou ausente' });

  try {
    // 1. Buscar números Twilio do usuário
    const numerosDoUsuario = await TwilioNumber.find({ owner: username });

    // 2. Extrair e limpar números (ex: "whatsapp:+14155238886" → "14155238886")
    const numerosLimpos = numerosDoUsuario.map(n =>
      n.number.replace('whatsapp:+', '')
    );

    if (numerosLimpos.length === 0) {
      return res.status(200).json([]); // Nenhum número = nenhum histórico
    }

    // 3. Buscar mensagens cujo roomId termina com esses números
    const regexRoomIds = numerosLimpos.map(num => new RegExp(`${num}$`));

    const messages = await Message.aggregate([
      {
        $match: {
          roomId: { $in: regexRoomIds }
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$message' },
          lastTimestamp: { $first: '$timestamp' }
        }
      },
      {
        $sort: { lastTimestamp: -1 }
      }
    ]);

    res.status(200).json(messages);
  } catch (error) {
    console.error('Erro ao buscar histórico de salas:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de salas' });
  }
});

export default router;
