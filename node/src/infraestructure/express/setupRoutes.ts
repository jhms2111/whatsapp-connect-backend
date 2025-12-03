// src/infraestructure/express/setupRoutes.ts
import express, { Express } from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

import { setupStaticRoutes } from './routes/staticRoutes';
import { setupTwilioRoutes } from './routes/twilioRoutes';
import { setupUploadRoutes } from './routes/uploadRoutes';

import { handleSocketConnection } from './handleSocketConnection';
import { authenticateJWT } from './middleware/authMiddleware';
import { requireActiveUser, shouldSkipActiveCheck } from './middleware/requireActiveUser';

import webchatBotsRoutes from './routes/webchatBotsRoutes';

// === rotas já existentes ===
import messageRoutes from './routes/messageRoutes';
import roomRoutes from './routes/roomRoutes';
import chatMessageRoutes from './routes/chatMessageRoutes';

// 👇 IMPORTA a rota + o injector
import sendWhatsapp, { injectSocketIO as injectSocketIOSend } from './routes/sendWhatsapp';

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

// 👇 IMPORTA a rota + o injector
import whatsappWebhook, { injectSocketIO as injectSocketIOWebhook } from './routes/whatsappWebhook';

import sessionRoutes from './routes/sessionRoutes';
import conversationQuotaRoutes from './routes/conversationQuotaRoutes';
import productRoutes from './routes/productRoutes';
import botRoutes from './routes/botRoutes';
import { router as botInteractionRoutes } from './routes/botInteractionRoutes';
import botsGlobalRoutes from './routes/botsGlobalRoutes';
import meBotsRoutes from './routes/meBotsRoutes';

// follow-up
import meFollowUpRoutes from './routes/meFollowUpRoutes';
import startFollowUpWorker from './workers/followUpWorker';

import { userSockets } from '../../modules/integration/damain/user';
import { createOrUpdateCliente } from '../mongo/mongodbAdapter';

import FollowUpSchedule from '../mongo/models/followUpQueueModel';
import qrCodeRoutes from './routes/qrCodeRoutes';
import passwordRoutes from './routes/passwordRoutes';

// 👇 webchat público (sem token)
import webchatRoutes from './routes/webchatRoutes';

// (opcional) checkout e webhook do WebChat
import webchatCheckoutRoutes from './routes/webchatCheckoutRoutes';
import webchatWebhook from './routes/webchatWebhook';
import webchatPrivateRoutes from './routes/webchatPrivateRoutes';

import billingCheckoutUnified from './routes/billingCheckoutUnified'

import webchatHistoryRoutes from './routes/webchatHistoryRoutes';
import webChatMessagesRoutes from './routes/webchatMessagesRoutes'
import webchatTrialRoutes from './routes/webchatTrialRoutes';

import webchatBotsGlobalStatusRoutes from './routes/webchatBotsGlobalStatusRoutes';

// 👇 VISITANTE webchat (SEM token)
import webchatVisitorRoutes from './routes/webchatVisitorRoutes';

import webchatPanelRoutes from './routes/webchatPanelRoutes';

import catalogRoutes from './routes/catalogRoutes'

import webchatSubscriptionRouter from './routes/webchatSubscription';

import webchatSubscriptionStatusRouter from './routes/webchatSubscriptionStatus';

import whatsappSubscriptionRouter from './routes/whatsappSubscription';

import whatsappSubscriptionStatus from './routes/whatsappSubscriptionStatus'


import catalogRouter from './routes/catalogRouter'

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

async function dropLegacyFollowUpIndex() {
  try {
    const coll = mongoose.connection.collection('followupschedules');
    const idx = await coll.indexes();
    const legacy = idx.find((i) => i.name === 'ownerUsername_1_contact_1');
    if (legacy) {
      console.warn('[followupschedules] Removendo índice legado ownerUsername_1_contact_1...');
      await coll.dropIndex('ownerUsername_1_contact_1');
      console.warn('[followupschedules] Índice legado removido.');
    } else {
      console.log('[followupschedules] Índice legado não existe (ok).');
    }
  } catch (e) {
    console.error('[followupschedules] Falha ao remover índice legado (segue):', e);
  }

  try {
    await FollowUpSchedule.syncIndexes();
    console.log('[followupschedules] Índices sincronizados.');
  } catch (e) {
    console.error('[followupschedules] Falha ao sincronizar índices:', e);
  }
}

export function setupRoutes(io: Server): Express {
  const app = express();

// CORS configurado para ambiente local + produção (Render + Vercel)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(
  cors({
    origin: [
      'http://localhost:3000',      // ambiente local
      FRONTEND_URL,                 // URL da Vercel
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);


  // 1) Webhooks ANTES (raw se necessário no arquivo do webhook)
  app.use('/api', stripeWebhookConversation);

  // 2) Parsers (garante JSON no body)
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // ====== 3) ROTAS PÚBLICAS ======
  app.use('/api', registerRoutes);
  app.use('/api', verificationRoutes);
  app.use('/api', userAuthRoutes);
  app.use('/api', meRoutes);           // /api/me/status
  app.use('/api', whatsappWebhook);

  // 👇 WEBCHAT público (SEM token)
  app.use('/api', webchatRoutes);

  // 👇 VISITANTE do WEBCHAT (SEM token) — **AGORA AQUI, ANTES DO AUTH**
  app.use('/api', webchatVisitorRoutes);

  // (opcional) Webhook do WebChat — público
  app.use('/api', webchatWebhook);

  // Health/check — público
  app.get('/check-session', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(200).json({ message: 'Sessão pública liberada', public: true });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const alreadyConnected = userSockets.has(decoded.username);
      if (alreadyConnected) return res.status(409).json({ error: 'Sessão já ativa para este usuário' });
      return res.status(200).json({ message: 'Sessão liberada' });
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  });

  // ====== 4) MIDDLEWARES DE AUTH/ACTIVE PARA O RESTO ======
  app.use('/api', (req, res, next) => {
    if (shouldSkipActiveCheck(req)) return next();
    return authenticateJWT(req, res, next);
  });

  app.use('/api', (req, res, next) => {
    if (shouldSkipActiveCheck(req)) return next();
    return requireActiveUser(req, res, next);
  });

  // 5) Rotas protegidas (todas as suas existentes)
  app.use('/api', messageRoutes);
  app.use('/api', chatMessageRoutes);
  app.use('/api', roomRoutes);

  app.use('/api', productRoutes);
  app.use('/api', productDeleteRoutes);
  app.use('/api', productEditRoutes);

  app.use('/api', botRoutes);
  app.use('/api', botDeleteRoutes);
  app.use('/api', botEditRoutes);
  app.use('/api', botInteractionRoutes);

  app.use('/api', sendWhatsapp);
  app.use('/api', twilioNumberRoutes);

  app.use('/api', numberRequestRoutes);
  app.use('/api/admin', adminNumberRoutes);
  app.use('/api', billingRoutes);

  app.use('/api', conversationPackageRoutes);
  app.use('/api', paymentRoutesConversation);
  app.use('/api', checkoutPackageRoutes);
  app.use('/api', checkoutPackage);

  app.use('/api', numberAccessRequestRoutes);
  app.use('/api/admin', adminNumberAccessRoutes);

  app.use('/api/admin', adminProductRoutes);
  app.use('/api/admin', adminClientRoutes);
  app.use('/api/admin', adminBotRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminUserRoutes);

  app.use('/api', historyRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', quotaRoutes);
  app.use('/api', conversationQuotaRoutes);

  app.use('/api', meBotsRoutes);
  app.use('/api', botsGlobalRoutes);

  app.use('/api', meFollowUpRoutes);
  app.use('/api', qrCodeRoutes);
  app.use('/api', passwordRoutes);

  app.use('/api', webchatPrivateRoutes);

  // (opcional) checkout do webchat
  app.use('/api', webchatCheckoutRoutes);

  app.use('/api', billingCheckoutUnified);

  app.use('/api', webchatHistoryRoutes);
  app.use('/api', webChatMessagesRoutes);
  app.use('/api', webchatTrialRoutes);

  app.use('/api', webchatBotsGlobalStatusRoutes);

  app.use('/api', webchatPanelRoutes);

  app.use('/api', catalogRoutes);

 ////// app.use('/api', catalogRouter);

 
  app.use('/api', webchatSubscriptionRouter);

  app.use('/api', webchatSubscriptionStatusRouter);

  app.use('/api', whatsappSubscriptionRouter); // 👈 novo

  app.use('/api', whatsappSubscriptionStatus);


  


  // 6) Estáticos / Twilio / Uploads


  // 6) Estáticos / Twilio / Uploads
app.set('trust proxy', true);

// 🔴 AQUI: deixa o io disponível para as rotas
app.set('io', io);


  app.set('trust proxy', true);
  setupStaticRoutes(app);
  setupTwilioRoutes(app, io);
  setupUploadRoutes(app, io);

  // 7) Socket.IO + servidor
  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`Servidor escutando em http://localhost:${PORT}`);
  });

  // ✅ injeta 'io' nas rotas que precisam emitir eventos em tempo real
  injectSocketIOWebhook(io);
  injectSocketIOSend(io);

  dropLegacyFollowUpIndex().catch(() => {});
  startFollowUpWorker(io);

  io.use(async (socket, next) => {
    const raw = socket.handshake.auth?.token;
    if (!raw || raw === 'null' || raw === 'undefined') {
      return next();
    }
    try {
      const decoded = jwt.verify(raw, JWT_SECRET) as { username: string };
      (socket as any).data.username = decoded.username;
      await createOrUpdateCliente(decoded.username);
      return next();
    } catch {
      return next();
    }
  });

io.attach(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://whatsapp-connect-two.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});


  io.on('connection', (socket) => {
    handleSocketConnection(socket, io);
  });

  return app;
}
