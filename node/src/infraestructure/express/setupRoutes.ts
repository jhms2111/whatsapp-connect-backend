// src/infraestructure/express/setupRoutes.ts
import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import { setupStaticRoutes } from './routes/staticRoutes';
import { setupTwilioRoutes } from './routes/twilioRoutes';
import { setupUploadRoutes } from './routes/uploadRoutes';
import { setupAudioRoutes, ensureUploadDirExists } from './routes/audioRoutes';
import { handleSocketConnection } from './handleSocketConnection';
import { authenticateJWT } from './middleware/authMiddleware';

import messageRoutes from './routes/messageRoutes';
import roomRoutes from '../express/routes/roomRoutes';
import chatMessageRoutes from './routes/chatMessageRoutes';
import sendWhatsapp from '../express/routes/sendWhatsapp';
import historyRoutes from '../../infraestructure/express/routes/historyRoutes';
import productDeleteRoutes from './routes/productDeleteRoutes';
import productEditRoutes from './routes/productEditRoutes';
import botDeleteRoutes from './routes/botDeleteRoutes';
import botEditRoutes from './routes/botEditRoutes';
import numberRequestRoutes from './routes/numberRequestRoutes';
import adminNumberRoutes from './routes/adminNumberRoutes';

// ⚠️ Stripe: webhook (usa express.raw) deve ser montado ANTES do express.json()
import stripeWebhook from './routes/stripeWebhook';
import billingRoutes from './routes/billingRoutes';

import dotenv from 'dotenv';
dotenv.config();

import { userSockets } from '../../modules/integration/damain/user';
import { createOrUpdateCliente } from '../mongo/mongodbAdapter';

// **Rotas para Produtos, Bots e Interação de Bots**
import productRoutes from './routes/productRoutes';
import botRoutes from './routes/botRoutes';
import { router as botInteractionRoutes } from './routes/botInteractionRoutes';

// 🔐 Login híbrido: MongoDB + fallback estático
import bcrypt from 'bcryptjs';
import User from '../mongo/models/userModel';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// Usuários estáticos de teste (fallback)
type StaticUser = { username: string; password: string; role: 'admin' | 'user' };
const STATIC_USERS: StaticUser[] = [
  { username: 'joaohenrique', password: '123456', role: 'admin' }, // admin geral (teste)
  { username: 'cliente1',     password: 'senha123', role: 'user'  }, // usuário comum (teste)
];

export function setupRoutes(io: Server): Express {
  const app = express();

  // CORS
  app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

  ensureUploadDirExists();

  // 1) Stripe webhook ANTES dos parsers (usa express.raw)
  app.use('/api', stripeWebhook);

  // 2) Parsers padrão
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json()); // bodyParser.json() seria redundante

  // Rotas base
  app.use('/api', messageRoutes);

  // 🔐 Login (híbrido): tenta MongoDB; se não achar, cai no fallback estático
  app.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }

      // 1) Tentativa via MongoDB (usuário real)
      try {
        const doc = await User.findOne({ username }).exec();
        if (doc) {
          const ok = await bcrypt.compare(password, doc.passwordHash);
          if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

          const token = jwt.sign(
            { id: doc.id, username: doc.username, role: doc.role },
            JWT_SECRET,
            { expiresIn: '1h' }
          );

          await createOrUpdateCliente(username);
          return res.json({ token });
        }
      } catch (dbErr) {
        // Se der erro de DB, apenas registra e cai no fallback estático
        console.warn('[LOGIN] Falha no lookup do Mongo, usando fallback estático:', dbErr);
      }

      // 2) Fallback: usuários estáticos de teste (sem bcrypt)
      const s = STATIC_USERS.find(u => u.username === username && u.password === password);
      if (!s) return res.status(401).json({ error: 'Credenciais inválidas' });

      const token = jwt.sign(
        { id: `static:${s.username}`, username: s.username, role: s.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      await createOrUpdateCliente(username);
      return res.json({ token });
    } catch (err) {
      console.error('[LOGIN] Erro inesperado:', err);
      return res.status(500).json({ error: 'Erro interno ao fazer login' });
    }
  });

  // ✅ Rota protegida (exemplo)
  app.get('/rota-protegida', authenticateJWT, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ message: 'Você acessou uma rota protegida!', usuario: user.username });
  });

  // ✅ Verificar se usuário já está com sessão socket ativa
  app.get('/check-session', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const alreadyConnected = userSockets.has(decoded.username);

      if (alreadyConnected) {
        return res.status(409).json({ error: 'Sessão já ativa para este usuário' });
      }

      return res.status(200).json({ message: 'Sessão liberada' });
    } catch (error) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  });

  // ⛓️ Integração das rotas da aplicação
  app.use('/api', chatMessageRoutes);
  app.use('/api', roomRoutes);
  app.use('/api', productRoutes);           // Produtos
  app.use('/api', botRoutes);               // Bots
  app.use('/api', botInteractionRoutes);    // Interação com o bot
  app.use('/api', sendWhatsapp);
  app.use('/api', historyRoutes);
  app.use('/api', productDeleteRoutes);     // Exclusão de produtos
  app.use('/api', productEditRoutes);       // Edição de produtos
  app.use('/api', botDeleteRoutes);
  app.use('/api', botEditRoutes);

  // Fluxo de pedido de número + Stripe (checkout normal após parsers)
  app.use('/api', numberRequestRoutes);
  app.use('/api', adminNumberRoutes);
  app.use('/api', billingRoutes);

  // Rotas de recursos existentes
  setupStaticRoutes(app);
  setupTwilioRoutes(app, io);
  setupUploadRoutes(app, io);
  setupAudioRoutes(app, io);

  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`Servidor escutando em http://localhost:${PORT}`);
  });

  // 🔐 Middleware do socket.io com JWT
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      console.warn('Socket sem token: conectado como Anônimo');
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      (socket as any).data.username = decoded.username;

      await createOrUpdateCliente(decoded.username);
      next();
    } catch (err) {
      console.error('JWT inválido:', err);
      next();
    }
  });

  io.attach(server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    handleSocketConnection(socket, io);
  });

  return app;
}
