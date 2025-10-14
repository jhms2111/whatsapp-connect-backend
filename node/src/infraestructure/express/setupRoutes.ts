// src/infraestructure/express/setupRoutes.ts
import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

import { setupStaticRoutes } from './routes/staticRoutes';
import { setupTwilioRoutes } from './routes/twilioRoutes';
import { setupUploadRoutes } from './routes/uploadRoutes';

import { handleSocketConnection } from './handleSocketConnection';
import { authenticateJWT } from './middleware/authMiddleware';
import { requireActiveUser, shouldSkipActiveCheck } from './middleware/requireActiveUser';

import messageRoutes from './routes/messageRoutes';
import roomRoutes from './routes/roomRoutes';
import chatMessageRoutes from './routes/chatMessageRoutes';
import sendWhatsapp from './routes/sendWhatsapp';
import historyRoutes from './routes/historyRoutes';
import productDeleteRoutes from './routes/productDeleteRoutes';
import productEditRoutes from './routes/productEditRoutes';
import botDeleteRoutes from './routes/botDeleteRoutes';
import botEditRoutes from './routes/botEditRoutes';
import numberRequestRoutes from './routes/numberRequestRoutes';
import adminNumberRoutes from './routes/adminNumberRoutes';
import twilioNumberRoutes from './routes/twilioNumberRoutes';
import adminTwilioNumberRoutes from './routes/adminTwilioNumberRoutes';
import adminProductRoutes from './routes/adminProductRoutes';
import adminClientRoutes from './routes/adminClientRoutes';
import adminBotRoutes from './routes/adminBotRoutes';
import adminRoutes from './routes/adminRoutes';
import registerRoutes from './routes/registerRoutes';
import verificationRoutes from './routes/verificationRoutes';
import stripeWebhookConversation from './routes/stripeWebhookConversation';
import paymentRoutesConversation from './routes/paymentRoutesConversation';
import userAuthRoutes from './routes/userAuthRoutes';
import conversationPackageRoutes from './routes/conversationPackageRoutes';
import checkoutPackageRoutes from './routes/checkoutPackageRoutes';
import checkoutPackage from './routes/checkoutPackage';
import numberAccessRequestRoutes from './routes/numberAccessRequestRoutes';
import quotaRoutes from './routes/quotaRoutes';
import meRoutes from './routes/meRoutes';
import billingRoutes from './routes/billingRoutes';
import adminNumberAccessRoutes from './routes/adminNumberAccessRoutes';
import adminUserRoutes from './routes/adminUserRoutes';
import whatsappWebhook from './routes/whatsappWebhook';
import sessionRoutes from './routes/sessionRoutes';

// Produtos/Bots/Interações
import productRoutes from './routes/productRoutes';
import botRoutes from './routes/botRoutes';
import { router as botInteractionRoutes } from './routes/botInteractionRoutes';

import { userSockets } from '../../modules/integration/damain/user';
import { createOrUpdateCliente } from '../mongo/mongodbAdapter';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

export function setupRoutes(io: Server): Express {
  const app = express();

  // CORS
  app.use(
    cors({
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  );

  // 1) Webhooks que precisam vir antes de json (usam express.raw dentro do módulo)
  //    stripeWebhookConversation já atende /api/billing/webhook e /api/billing/package-webhook
  app.use('/api', stripeWebhookConversation);

  // 2) Parsers padrão
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // 3) Middlewares condicionais de auth e bloqueio:
  //    - pulam login/registro/webhook/me/status/socket.io
  app.use('/api', (req, res, next) => {
    if (shouldSkipActiveCheck(req)) return next();
    return authenticateJWT(req, res, next);
  });

  app.use('/api', (req, res, next) => {
    if (shouldSkipActiveCheck(req)) return next();
    return requireActiveUser(req, res, next);
  });

  // 4) Rota protegida de exemplo (mantida)
  app.get('/rota-protegida', authenticateJWT, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ message: 'Você acessou uma rota protegida!', usuario: user.username });
  });

  // 5) Verificar sessão socket
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
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  });

  // 6) Rotas da aplicação
  // Auth / Registro / Verificação (públicas por SKIP em shouldSkipActiveCheck)
  app.use('/api', registerRoutes);
  app.use('/api', verificationRoutes);
  app.use('/api', userAuthRoutes);

  // Me (status do usuário – permitido no SKIP)
  app.use('/api', meRoutes);

  // Mensagens / Salas / Chat
  app.use('/api', messageRoutes);
  app.use('/api', chatMessageRoutes);
  app.use('/api', roomRoutes);

  // Bot / Produtos
  app.use('/api', productRoutes);
  app.use('/api', productDeleteRoutes);
  app.use('/api', productEditRoutes);

  app.use('/api', botRoutes);
  app.use('/api', botDeleteRoutes);
  app.use('/api', botEditRoutes);
  app.use('/api', botInteractionRoutes);

  // WhatsApp / Twilio
  app.use('/api', sendWhatsapp);
  app.use('/api', twilioNumberRoutes);

  // Pedidos de número / Admin números / Billing
  app.use('/api', numberRequestRoutes);
  app.use('/api/admin', adminNumberRoutes);         // ← admin
  app.use('/api', billingRoutes);

  // Pacotes de conversas, pagamentos e checkout
  app.use('/api', conversationPackageRoutes);
  app.use('/api', paymentRoutesConversation);
  app.use('/api', checkoutPackageRoutes);
  app.use('/api', checkoutPackage);

  // Solicitação de autorização para número (cliente e admin)
  app.use('/api', numberAccessRequestRoutes);
  app.use('/api/admin', adminNumberAccessRoutes);   // ← admin

  // Admin — produtos / clientes / bots / user moderation
  app.use('/api/admin', adminProductRoutes);        // ← admin
  app.use('/api/admin', adminClientRoutes);         // ← admin
  app.use('/api/admin', adminBotRoutes);            // ← admin
  app.use('/api/admin', adminRoutes);               // ← admin
  app.use('/api/admin', adminUserRoutes);           // ← admin  (corrigido — era /api)

  // Histórico / Sessão / Quota / Webhook WhatsApp
  app.use('/api', historyRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', quotaRoutes);
  app.use('/api', whatsappWebhook);

  // 7) Rotas estáticas / Twilio / Uploads
  setupStaticRoutes(app);
  setupTwilioRoutes(app, io);
  setupUploadRoutes(app, io);

  // 8) Socket.IO + JWT
  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`Servidor escutando em http://localhost:${PORT}`);
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // permitir socket anônimo se preferir
      return next();
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      (socket as any).data.username = decoded.username;
      await createOrUpdateCliente(decoded.username);
      next();
    } catch (err) {
      console.error('JWT inválido no socket:', err);
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
