// src/infraestructure/express/setupRoutes.ts
import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import { setupStaticRoutes } from './routes/staticRoutes';
import { setupTwilioRoutes } from './routes/twilioRoutes';
import { setupUploadRoutes } from './routes/uploadRoutes';

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
import twilioNumberRoutes from './routes/twilioNumberRoutes'
import adminTwilioNumberRoutes from './routes/adminTwilioNumberRoutes';
import adminProductRoutes from './routes/adminProductRoutes'
import adminClientRoutes from './routes/adminClientRoutes'
import adminBotRoutes from './routes/adminBotRoutes'
import adminRoutes from './routes/adminRoutes'

import registerRoutes from './routes/registerRoutes'
import verificationRoutes from './routes/verificationRoutes'


import userAuthRoutes from './routes/userAuthRoutes'



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
  { username: 'cliente2',     password: 'senha123', role: 'user'  }, // usuário comum (teste)
];

export function setupRoutes(io: Server): Express {
  const app = express();

  // CORS
  app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

 

  // 1) Stripe webhook ANTES dos parsers (usa express.raw)
  app.use('/api', stripeWebhook);

  // 2) Parsers padrão
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json()); // bodyParser.json() seria redundante

  // Rotas base
  app.use('/api', messageRoutes);


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
  app.use('/api', twilioNumberRoutes);
  app.use('/api', adminTwilioNumberRoutes);
  app.use('/api', adminProductRoutes);
  app.use('/api', adminClientRoutes);
  app.use('/api', adminBotRoutes);
  app.use('/api/admin', adminRoutes);

  

  


  // Fluxo de pedido de número + Stripe (checkout normal após parsers)
  app.use('/api', numberRequestRoutes);
  app.use('/api', adminNumberRoutes);
  app.use('/api', billingRoutes);

  app.use('/api', registerRoutes)
  app.use('/api', verificationRoutes )

  app.use('/api', userAuthRoutes )



  // Rotas de recursos existentes
  setupStaticRoutes(app);
  setupTwilioRoutes(app, io);
  setupUploadRoutes(app, io);
  


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
