import express, { Express, Request, Response } from 'express';
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

// === suas rotas já existentes ===
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
import conversationQuotaRoutes from './routes/conversationQuotaRoutes';
import productRoutes from './routes/productRoutes';
import botRoutes from './routes/botRoutes';
import { router as botInteractionRoutes } from './routes/botInteractionRoutes';
import botsGlobalRoutes from './routes/botsGlobalRoutes';
import meBotsRoutes from './routes/meBotsRoutes';


// rota de follow-up (protegida)
import meFollowUpRoutes from './routes/meFollowUpRoutes';

// worker de follow-up
import startFollowUpWorker from './workers/followUpWorker';

import { userSockets } from '../../modules/integration/damain/user';
import { createOrUpdateCliente } from '../mongo/mongodbAdapter';

// === MODELS usados para manutenção
import FollowUpSchedule from '../mongo/models/followUpQueueModel';

import qrCodeRoutes from './routes/qrCodeRoutes';

import passwordRoutes from './routes/passwordRoutes'; // <-- ADICIONE ESTE IMPORT

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

/** Remove o índice legado `ownerUsername_1_contact_1` se existir. */
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
    console.error('[followupschedules] Falha ao remover índice legado (segue assim mesmo):', e);
  }

  // Garante os índices atuais (inclui o parcial 1-pendente-por-conversa)
  try {
    await FollowUpSchedule.syncIndexes(); // idempotente
    console.log('[followupschedules] Índices sincronizados.');
  } catch (e) {
    console.error('[followupschedules] Falha ao sincronizar índices:', e);
  }
}

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

  // 1) Webhooks ANTES
  app.use('/api', stripeWebhookConversation);

  // 2) Parsers
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // ====== 3) ROTAS PÚBLICAS ======
  app.use('/api', registerRoutes);
  app.use('/api', verificationRoutes);
  app.use('/api', userAuthRoutes);
  app.use('/api', meRoutes);          // /api/me/status (GET) — pública de status
  app.use('/api', whatsappWebhook);   // /api/whatsapp/webhook

  // Health/check
  app.get('/check-session', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
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

  // 5) Rota protegida exemplo
  app.get('/rota-protegida', authenticateJWT, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ message: 'Você acessou uma rota protegida!', usuario: user.username });
  });

  // ====== 6) ROTAS PROTEGIDAS ======
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

  // rota do follow-up (protegida)
  app.use('/api', meFollowUpRoutes);

  app.use('/api', qrCodeRoutes);

  app.use('/api', passwordRoutes); // <-- MONTA AQUI, ANTES DO AUTH

 
  

  // 7) Estáticos / Twilio / Uploads
  app.set('trust proxy', true); // para req.protocol correto atrás de proxy
  setupStaticRoutes(app);
  setupTwilioRoutes(app, io);
  setupUploadRoutes(app, io);

  // 8) Socket.IO + servidor
  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`Servidor escutando em http://localhost:${PORT}`);
  });

  // 🧹 Remoção de índice legado + sync de índices atuais (uma vez no boot)
  dropLegacyFollowUpIndex().catch(() => { /* noop */ });

  // ⚡ Inicia o worker de follow-up
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
      return next(); // segue como anônimo
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
