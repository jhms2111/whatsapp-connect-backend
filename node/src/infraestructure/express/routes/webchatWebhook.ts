import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { WEBCHAT_PACKAGES } from '../../../utils/webchatPackages';

const router = express.Router();

/**
 * Modo seguro:
 * - Se as envs não estiverem definidas, NÃO lança erro (evita crash em dev).
 * - Apenas registra aviso e atende o webhook com 200 para o Stripe não ficar reentregando em dev.
 */
const STRIPE_SECRET_KEY_WEBCHAT = process.env.STRIPE_SECRET_KEY_WEBCHAT || '';
const STRIPE_WEBHOOK_SECRET_WEBCHAT = process.env.STRIPE_WEBHOOK_SECRET_WEBCHAT || '';
const DISABLE_VERIFY = process.env.DISABLE_STRIPE_SIG_VERIFY_WEBCHAT === 'true';

const stripe = STRIPE_SECRET_KEY_WEBCHAT
  ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT /* , { apiVersion: '2023-10-16' } as any */)
  : null;

/** Utilidades do período do pacote (30 dias por padrão) */
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

/** Normalizações de IDs de compra (idempotência) */
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

/** Core: ativa/renova pacote WebChat em WebchatQuota */
async function activateWebchatPackage(
  username: string | undefined | null,
  packageTypeStr: string | undefined | null,
  source: string,
  purchaseId?: string | null,
  subscriptionId?: string | null     // 👈 NOVO PARAM
) {
  const u = username?.trim();
  const pNum = Number(packageTypeStr) as keyof typeof WEBCHAT_PACKAGES;

  if (!u || !pNum || !WEBCHAT_PACKAGES[pNum]) {
    console.warn(`❌ [webchat] Metadata/pacote inválido (${source}):`, { username: u, packageTypeStr });
    return;
  }

  const pacote = WEBCHAT_PACKAGES[pNum];
  const now = new Date();
  const newStart = now;
  const newEnd = addPeriod(now);

  let current = await WebchatQuota.findOne({ username: u });

  // idempotência
  if (purchaseId && current?.lastStripeCheckoutId === purchaseId) {
    console.log(`⚠️ [webchat ${source}] Ignorado: purchaseId já aplicado`, { username: u, purchaseId });
    return;
  }

  // Sem quota atual ou expirada => reset total
  if (!current || isExpired(current.periodEnd)) {
    const quota = (await WebchatQuota.findOneAndUpdate(
      { username: u },
      {
        $setOnInsert: { username: u, createdAt: new Date() },
        $set: {
          packageType: Number(pNum),
          totalConversations: pacote.conversations,
          usedCharacters: 0,
          lastStripeCheckoutId: purchaseId ?? null,
          stripeSubscriptionId: subscriptionId ?? null, // 👈 SALVA ID DA ASSINATURA
          coins: pacote.conversations,
          coinsExpiresAt: newEnd,
          periodStart: newStart,
          periodEnd: newEnd,
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    )) as IWebchatQuota;

    console.log(`✅ [webchat ${source}] Novo período: +${pacote.conversations} conv. p/ ${u}`);
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
      stripeSubscriptionId: quota?.stripeSubscriptionId,
    });
    return;
  }

  // Período ativo => soma e reinicia período
  current.totalConversations = (current.totalConversations || 0) + pacote.conversations;
  current.coins = (current.coins || 0) + pacote.conversations;
  current.periodStart = newStart;
  current.periodEnd = newEnd;
  current.coinsExpiresAt = newEnd;
  current.packageType = Number(pNum);
  current.lastStripeCheckoutId = purchaseId ?? current.lastStripeCheckoutId ?? null;
  current.stripeSubscriptionId = subscriptionId ?? current.stripeSubscriptionId ?? null; // 👈 ATUALIZA
  current.updatedAt = new Date();
  await current.save();

  console.log(
    `✅ [webchat ${source}] Período ativo: somado +${pacote.conversations} conv. e reiniciado p/ ${u}`
  );
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
    stripeSubscriptionId: current.stripeSubscriptionId,
  });
}

/**
 * Rota do webhook do Stripe para o WebChat.
 * OBS: precisa ser montada ANTES de express.json() e usando express.raw().
 */
router.post(
  ['/billing/webchat/webhook', '/billing/webchat-package-webhook'],
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      // Falta de configuração => não crasha, apenas responde 200
      if (!stripe || !STRIPE_WEBHOOK_SECRET_WEBCHAT) {
        console.warn('[webchat webhook] Stripe desabilitado: variáveis de ambiente ausentes.');
        return res.status(200).send('WEBCHAT_WEBHOOK_DISABLED');
      }

      const sig = req.headers['stripe-signature'] as string | undefined;
      let event: Stripe.Event;

      if (DISABLE_VERIFY) {
        const isBuf = Buffer.isBuffer(req.body);
        const raw = isBuf ? req.body.toString('utf8') : JSON.stringify(req.body);
        console.warn('!!! DEV ONLY: assinatura Stripe DESABILITADA para webchat');
        event = JSON.parse(raw);
      } else {
        if (!sig) return res.status(400).send('Missing stripe-signature');
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET_WEBCHAT);
      }

      console.log('[webchat webhook] type:', event.type);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const md = session.metadata || {};
          const normalizedId = normalizePurchaseIdFromSession(session);

          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : (session.subscription as any)?.id || null;

          await activateWebchatPackage(
            md.username as any,
            md.packageType as any,
            'checkout.session.completed',
            normalizedId,
            subscriptionId
          );
          break;
        }

        case 'invoice.paid':
        case 'invoice.payment_succeeded':
        case 'invoice_payment.paid': {
          const invoiceAny: any = event.data.object;

          let subId: string | undefined =
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
              console.error('[webchat webhook] Falha ao recuperar subscription:', e);
              md = (invoiceAny.metadata as any) || {};
            }
          } else {
            md = (invoiceAny.metadata as any) || {};
          }

          const normalizedId = normalizePurchaseIdFromInvoice(invoiceAny);
          await activateWebchatPackage(
            md.username as any,
            md.packageType as any,
            `${event.type}->normalized`,
            normalizedId,
            subId || null
          );
          break;
        }

        case 'customer.subscription.created': {
          const sub = event.data.object as Stripe.Subscription;
          const md = sub.metadata || {};
          const normalizedId = normalizePurchaseIdFromSubscription(sub);
          console.log('[webchat webhook] subscription.created', {
            username: md.username,
            packageType: md.packageType,
            normalizedId,
          });
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
            console.log('[webchat webhook] (info) evento ignorado:', event.type);
          }
          break;
        }
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error('[webchat webhook] erro:', err?.message || err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

export default router;
