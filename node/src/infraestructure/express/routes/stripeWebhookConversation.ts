// src/infraestructure/express/routes/stripeWebhookConversation.ts
import express from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import NumberRequest from '../../mongo/models/numberRequestModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada');
if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET não configurada');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-05-28.basil' as any,
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// ==========================================================
// 🔧 TEST MODE: período de 1 minuto (para testes locais)
// ==========================================================
const CHARS_PER_CONVERSATION = 500;
const MINUTE_MS = 60 * 1000;
const PERIOD_MS = 1 * MINUTE_MS; // <<< alterado de 30 dias para 1 minuto

function addPeriod(from: Date = new Date()) {
  return new Date(from.getTime() + PERIOD_MS);
}
function isExpired(end?: Date | string | null) {
  if (!end) return true;
  const d = new Date(end);
  return Number.isNaN(d.getTime()) || Date.now() > d.getTime();
}

// ==========================================================
// Funções utilitárias de normalização de purchaseId
// ==========================================================
function normalizePurchaseIdFromSession(session: Stripe.Checkout.Session): string {
  const inv =
    (typeof session.invoice === 'string' ? session.invoice : (session.invoice as any)?.id) || null;
  const pi =
    (typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id) || null;
  return inv || pi || session.id;
}
function normalizePurchaseIdFromInvoice(invoice: Stripe.Invoice | any): string {
  return invoice?.id;
}
function normalizePurchaseIdFromSubscription(sub: Stripe.Subscription): string {
  const latestInv =
    (typeof sub.latest_invoice === 'string' ? sub.latest_invoice : (sub.latest_invoice as any)?.id) ||
    null;
  return latestInv || sub.id;
}

// ==========================================================
// Core: ativar/renovar pacote
// ==========================================================
async function activatePackage(
  username: string | undefined | null,
  packageTypeStr: string | undefined | null,
  source: string,
  purchaseId?: string | null
) {
  const u = username?.trim();
  const p = Number(packageTypeStr) as keyof typeof PACKAGES;

  if (!u || !p || !PACKAGES[p]) {
    console.warn(`❌ Metadata/pacote inválido (${source}):`, { username: u, packageTypeStr });
    return;
  }

  const pacote = PACKAGES[p];
  const now = new Date();
  const newStart = now;
  const newEnd = addPeriod(now); // <<< 1 minuto a partir de agora

  let current = await ConversationQuota.findOne({ username: u });

  if (purchaseId && current?.lastStripeCheckoutId === purchaseId) {
    console.log(`⚠️ [${source}] Ignorado (idempotência): purchaseId já aplicado`, { username: u, purchaseId });
    return;
  }

  if (!current || isExpired(current.periodEnd)) {
    const quota = (await ConversationQuota.findOneAndUpdate(
      { username: u },
      {
        $setOnInsert: { username: u, createdAt: new Date() },
        $set: {
          packageType: Number(p),
          totalConversations: pacote.conversations,
          usedCharacters: 0,
          lastStripeCheckoutId: purchaseId ?? null,
          coins: pacote.conversations,
          coinsExpiresAt: newEnd,
          periodStart: newStart,
          periodEnd: newEnd,
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    )) as IConversationQuota;

    console.log(`✅ [${source}] Novo período 1m (reset): +${pacote.conversations} conv. p/ ${u}`);
    console.log('📄 Estado:', {
      username: quota?.username,
      periodStart: quota?.periodStart,
      periodEnd: quota?.periodEnd,
      totalConversations: quota?.totalConversations,
      usedCharacters: quota?.usedCharacters,
      packageType: quota?.packageType,
      coins: quota?.coins,
      coinsExpiresAt: quota?.coinsExpiresAt,
      lastStripeCheckoutId: quota?.lastStripeCheckoutId,
    });
    return;
  }

  current.totalConversations = (current.totalConversations || 0) + pacote.conversations;
  current.coins = (current.coins || 0) + pacote.conversations;
  current.periodStart = newStart;
  current.periodEnd = newEnd;
  current.coinsExpiresAt = newEnd;
  current.packageType = Number(p);
  current.lastStripeCheckoutId = purchaseId ?? current.lastStripeCheckoutId ?? null;
  current.updatedAt = new Date();
  await current.save();

  console.log(`✅ [${source}] Período ativo: somado +${pacote.conversations} conv. e REINICIADO 1m a partir de agora p/ ${u}`);
  console.log('📄 Estado:', {
    username: current.username,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    totalConversations: current.totalConversations,
    usedCharacters: current.usedCharacters,
    packageType: current.packageType,
    coins: current.coins,
    coinsExpiresAt: current.coinsExpiresAt,
    lastStripeCheckoutId: current.lastStripeCheckoutId,
  });
}

// ==========================================================
// Auxiliar: marcar NumberRequest como pago
// ==========================================================
async function markNumberRequestPaid(nrId?: string | null, sessionId?: string) {
  if (!nrId) return;
  const nr = await NumberRequest.findById(nrId);
  if (!nr) {
    console.warn('⚠️ numberRequestId não encontrado:', nrId);
    return;
  }
  nr.status = 'paid';
  nr.paidAt = new Date();
  if (!nr.checkoutSessionId && sessionId) nr.checkoutSessionId = sessionId;
  await nr.save();
  console.log('✅ NumberRequest marcado como paid:', nr.id);
}

// ==========================================================
// Webhook Stripe
// ==========================================================
router.post(
  ['/billing/package-webhook', '/billing/webhook'],
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const SKIP_VERIFY = process.env.DISABLE_STRIPE_SIG_VERIFY === 'true';

    try {
      const isBuf = Buffer.isBuffer(req.body);
      console.log('[BILLING] webhook hit:', req.originalUrl, 'sig?', !!sig, 'rawBuffer?', isBuf);

      let event: Stripe.Event;
      if (SKIP_VERIFY) {
        const raw = isBuf ? req.body.toString('utf8') : JSON.stringify(req.body);
        console.warn('!!! DEV ONLY: Stripe signature verification DISABLED');
        event = JSON.parse(raw);
      } else {
        if (!sig) return res.status(400).send('Missing stripe-signature');
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      }

      console.log('[BILLING] webhook type:', event.type);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const md = session.metadata || {};
          await markNumberRequestPaid(md.numberRequestId as any, session.id);

          const normalizedId = normalizePurchaseIdFromSession(session);
          await activatePackage(md.username as any, md.packageType as any, 'checkout.session.completed', normalizedId);
          break;
        }

        case 'customer.subscription.created': {
          const sub = event.data.object as Stripe.Subscription;
          const md = sub.metadata || {};
          const normalizedId = normalizePurchaseIdFromSubscription(sub);
          console.log('[BILLING] customer.subscription.created (info):', {
            username: md.username,
            packageType: md.packageType,
            normalizedId,
          });
          break;
        }

        case 'invoice.paid':
        case 'invoice.payment_succeeded':
        case 'invoice_payment.paid': {
          const invoiceAny: any = event.data.object;
          const subId: string | undefined =
            (typeof invoiceAny.subscription === 'string'
              ? invoiceAny.subscription
              : invoiceAny.subscription?.id) ??
            invoiceAny.subscription_details?.subscription ??
            invoiceAny.lines?.data?.find((li: any) => li.subscription)?.subscription;

          let md: Record<string, string | undefined> = {};
          if (subId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subId);
              md = subscription.metadata || {};
            } catch (e) {
              console.error('[BILLING] Falha ao recuperar subscription p/', event.type, e);
              md = (invoiceAny.metadata as any) || {};
            }
          } else {
            md = (invoiceAny.metadata as any) || {};
          }

          const normalizedId = normalizePurchaseIdFromInvoice(invoiceAny);
          await activatePackage(md.username as any, md.packageType as any, `${event.type}->normalized`, normalizedId);
          break;
        }

        default: {
          if (
            event.type.startsWith('invoice.') ||
            event.type.startsWith('invoice_') ||
            event.type.startsWith('payment_intent.') ||
            event.type.startsWith('charge.') ||
            event.type.startsWith('customer.')
          ) {
            console.log('[BILLING] (info) evento ignorado:', event.type);
          }
          break;
        }
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error('[BILLING] webhook conversation error:', err?.message || err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

export default router;
