import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';

// ⚠️ Mantive seus caminhos. Se seu tsconfig usa "paths" ou barrels, deixar explícito ajuda a evitar colisões.
import type { Model } from 'mongoose';
import ConversationQuotaModel from '../../mongo/models/conversationQuotaModel';
import WebchatQuotaModel from '../../mongo/models/webchatQuotaModel';

import { PACKAGES, getPackage } from '../../../utils/packages'; // <- unificado (whatsapp + webchat)
export type Channel = 'whatsapp' | 'webchat';

dotenv.config();

/**
 * IMPORTANTE:
 * - Este arquivo espera que o setupRoutes tenha montado este router com express.raw({type:'application/json'})
 *   ANTES do express.json(), para que a verificação de assinatura do Stripe funcione.
 */

// Renomeado para evitar qualquer sombra/colisão de nome com outros arquivos
const billingRouter = express.Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const DISABLE_VERIFY = process.env.DISABLE_STRIPE_SIG_VERIFY === 'true';

// Se quiser, defina explicitamente a apiVersion que você usa no projeto
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// ❗Dica: isso força o TS a tratar como Model do Mongoose mesmo se algum barrel bagunçar a resolução.
const ConversationQuota = ConversationQuotaModel as unknown as Model<any>;
const WebchatQuota = WebchatQuotaModel as unknown as Model<any>;

// ============== Helpers de período ==============
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * DAY_MS;
function addPeriod(from: Date = new Date()) {
  return new Date(from.getTime() + PERIOD_MS);
}
function isExpired(end?: Date | string | null) {
  if (!end) return true;
  const d = new Date(end);
  return Number.isNaN(d.getTime()) || Date.now() > d.getTime();
}

// ============== Normalizações de IDs (idempotência) ==============
function normalizePurchaseIdFromSession(session: Stripe.Checkout.Session): string {
  const inv =
    (typeof session.invoice === 'string'
      ? session.invoice
      : (session.invoice as any)?.id) || null;
  const pi =
    (typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id) || null;
  return (inv || pi || session.id) as string;
}
function normalizePurchaseIdFromInvoice(invoice: Stripe.Invoice | any): string {
  return invoice?.id;
}
function normalizePurchaseIdFromSubscription(sub: Stripe.Subscription): string {
  const latestInv =
    (typeof sub.latest_invoice === 'string'
      ? sub.latest_invoice
      : (sub.latest_invoice as any)?.id) || null;
  return (latestInv || sub.id) as string;
}

// ============== Crédito por canal ==============
async function creditWhatsapp(
  username: string,
  conversationsToAdd: number,
  purchaseId?: string | null
) {
  const now = new Date();
  const doc = await ConversationQuota.findOne({ username }).lean().exec();

  if (!doc || isExpired((doc as any).periodEnd)) {
    await ConversationQuota.findOneAndUpdate(
      { username },
      {
        $setOnInsert: { username, createdAt: now },
        $set: {
          totalConversations: conversationsToAdd,
          usedCharacters: 0,
          updatedAt: now,
          periodStart: now,
          periodEnd: addPeriod(now),
          lastStripeCheckoutId: purchaseId ?? null,
        },
      },
      { new: true, upsert: true }
    ).lean().exec();
    return;
  }

  await ConversationQuota.updateOne(
    { username },
    {
      $inc: { totalConversations: conversationsToAdd },
      $set: {
        updatedAt: now,
        periodStart: now,
        periodEnd: addPeriod(now),
        lastStripeCheckoutId:
          purchaseId ?? (doc as any).lastStripeCheckoutId ?? null,
      },
    }
  ).exec();
}

async function creditWebchat(
  username: string,
  conversationsToAdd: number,
  purchaseId?: string | null,
  subscriptionId?: string | null       // 👈 NOVO PARAM
) {
  const now = new Date();
  const doc = await WebchatQuota.findOne({ username }).exec();

  if (!doc || isExpired((doc as any).periodEnd)) {
    await WebchatQuota.findOneAndUpdate(
      { username },
      {
        $setOnInsert: { username, createdAt: now },
        $set: {
          totalConversations: conversationsToAdd,
          usedCharacters: 0,
          updatedAt: now,
          periodStart: now,
          periodEnd: addPeriod(now),
          lastStripeCheckoutId: purchaseId ?? null,
          stripeSubscriptionId: subscriptionId ?? null, // 👈 SALVA
        },
      },
      { new: true, upsert: true }
    ).lean().exec();
    return;
  }

  // doc existe e período ainda ativo
  doc.totalConversations = (doc.totalConversations || 0) + conversationsToAdd;
  doc.updatedAt = now;
  doc.periodStart = now;
  doc.periodEnd = addPeriod(now);
  doc.lastStripeCheckoutId = purchaseId ?? doc.lastStripeCheckoutId ?? null;
  doc.stripeSubscriptionId = subscriptionId ?? doc.stripeSubscriptionId ?? null; // 👈 ATUALIZA
  await doc.save();
}

async function creditPackageByChannel(
  channel: Channel,
  username: string,
  packageType: number,
  purchaseId?: string | null,
  subscriptionId?: string | null     // 👈 NOVO PARAM
) {
  // Busca o pacote no arquivo unificado
  const pkg = getPackage(channel, packageType);
  if (!pkg) {
    console.warn(
      `[BILLING] pacote inexistente: channel=${channel} packageType=${packageType}`
    );
    return;
  }

  const conversationsToAdd = Number(pkg.conversations) || 0;
  if (conversationsToAdd <= 0) {
    console.warn(`[BILLING] conversations inválido no pacote:`, {
      channel,
      packageType,
      pkg,
    });
    return;
  }

  if (channel === 'whatsapp') {
    await creditWhatsapp(username, conversationsToAdd, purchaseId || null);
  } else if (channel === 'webchat') {
    await creditWebchat(username, conversationsToAdd, purchaseId || null, subscriptionId || null);
  }
}

// ============== Leitura de metadata com segurança ==============
function getMeta(obj: any): {
  channel?: Channel;
  username?: string;
  packageType?: number;
} {
  const md = (obj?.metadata || {}) as Record<string, string | undefined>;
  const channelRaw = md.channel;
  const username = md.username;
  const packageTypeStr = md.packageType;

  const channel: Channel | undefined =
    channelRaw === 'whatsapp' || channelRaw === 'webchat'
      ? channelRaw
      : undefined;

  const packageType = packageTypeStr ? Number(packageTypeStr) : undefined;

  return { channel, username, packageType };
}

// ============== Webhook ==============
billingRouter.post(
  ['/billing/package-webhook', '/billing/webhook'],
  // ⚠️ É essencial estar ANTES do express.json() no app principal
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        console.warn('[BILLING] Stripe webhook desabilitado (env ausentes).');
        return res.status(200).send('WEBHOOK_DISABLED');
      }

      const sig = req.headers['stripe-signature'] as string | undefined;
      let event: Stripe.Event;

      if (DISABLE_VERIFY) {
        const raw = Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body);
        console.warn('!!! DEV ONLY: assinatura Stripe DESABILITADA (billing webhook)');
        event = JSON.parse(raw);
      } else {
        if (!sig) return res.status(400).send('Missing stripe-signature');
        // req.body precisa ser o Buffer bruto (raw)
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          STRIPE_WEBHOOK_SECRET
        );
      }

      console.log('[BILLING] webhook type:', event.type);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { channel, username, packageType } = getMeta(session);
          const purchaseId = normalizePurchaseIdFromSession(session);

          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : (session.subscription as any)?.id || null;

          if (!channel || !username || !packageType) {
            console.warn(
              '❌ Metadata/pacote inválido (checkout.session.completed):',
              {
                channel,
                username,
                packageType,
              }
            );
            break;
          }

          await creditPackageByChannel(
            channel,
            username,
            packageType,
            purchaseId,
            subscriptionId
          );
          break;
        }

        case 'invoice.paid':
        case 'invoice.payment_succeeded':
        case 'invoice_payment.paid': {
          const invoiceAny: any = event.data.object;

          let channel: Channel | undefined;
          let username: string | undefined;
          let packageType: number | undefined;

          const metaInvoice = getMeta(invoiceAny);
          channel = metaInvoice.channel;
          username = metaInvoice.username;
          packageType = metaInvoice.packageType;

          let subId: string | undefined =
            (typeof invoiceAny.subscription === 'string'
              ? invoiceAny.subscription
              : invoiceAny.subscription?.id) ?? undefined;

          // Se vieram vazios, tenta via subscription
          if (!channel || !username || !packageType) {
            if (subId) {
              try {
                const subscription = await stripe.subscriptions.retrieve(subId);
                const metaSub = getMeta(subscription);
                channel = channel || metaSub.channel;
                username = username || metaSub.username;
                packageType = packageType || metaSub.packageType;
              } catch {
                // ignora erro ao recuperar sub
              }
            }
          }

          if (!channel || !username || !packageType) {
            console.warn(
              `❌ Metadata/pacote inválido (${event.type}->normalized):`,
              { channel, username, packageType }
            );
            break;
          }

          const purchaseId = normalizePurchaseIdFromInvoice(invoiceAny);
          await creditPackageByChannel(
            channel,
            username,
            packageType,
            purchaseId,
            subId || null
          );
          break;
        }

        case 'customer.subscription.created': {
          const sub = event.data.object as Stripe.Subscription;
          const { channel, username, packageType } = getMeta(sub);
          const normalizedId = normalizePurchaseIdFromSubscription(sub);
          console.log('[BILLING] customer.subscription.created (info):', {
            channel,
            username,
            packageType,
            normalizedId,
          });
          break;
        }

        default: {
          if (
            event.type.startsWith('invoice') ||
            event.type.startsWith('payment_intent') ||
            event.type.startsWith('charge') ||
            event.type.startsWith('customer') ||
            event.type.startsWith('payment_method')
          ) {
            console.log('[BILLING] (info) evento ignorado:', event.type);
          }
          break;
        }
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error('[BILLING] webhook error:', err?.message || err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

export default billingRouter;
