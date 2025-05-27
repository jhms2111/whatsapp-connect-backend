import { Router } from 'express';
import jwt from 'jsonwebtoken';
import MessageModel from '../../mongo/models/messageModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const router = Router();

// Função auxiliar para extrair username do token
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

// GET mensagens por roomId com validação de owner
router.get('/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const username = getUsernameFromToken(req);
  if (!username) return res.status(401).json({ error: 'Token inválido ou ausente' });

  try {
    // Extrair número do roomId (ex: "xxx___14155238886" → "14155238886")
    const partes = roomId.split('___');
    const numeroSala = partes.length > 1 ? partes[1] : null;
    if (!numeroSala) {
      return res.status(400).json({ error: 'roomId inválido.' });
    }

    // Buscar todos os números do Twilio pertencentes ao usuário
    const numerosDoUsuario = await TwilioNumber.find({ owner: username });

    // Limpar números (ex: "whatsapp:+14155238886" → "14155238886")
    const numerosLimpos = numerosDoUsuario.map(n =>
      n.number.replace('whatsapp:+', '')
    );

    // Verificar se o número da sala pertence ao usuário
    const autorizado = numerosLimpos.includes(numeroSala);
    if (!autorizado) {
      return res.status(403).json({ error: 'Você não tem acesso a esta conversa.' });
    }

    // Buscar e retornar as mensagens da sala
    const messages = await MessageModel.find({ roomId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
});

export default router;
