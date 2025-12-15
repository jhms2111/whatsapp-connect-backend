import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import { getPackage } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WHATSAPP =
  process.env.STRIPE_SECRET_KEY_WHATSAPP || process.env.STRIPE_SECRET_KEY || '';

if (!STRIPE_SECRET_KEY_WHATSAPP) {
  throw new Error('STRIPE_SECRET_KEY_WHATSAPP/STRIPE_SECRET_KEY não configurada');
}

const stripe = new Stripe(STRIPE_SECRET_KEY_WHATSAPP, {
  // apiVersion: '2023-10-16',
});

/**
 * Helpers
 */
function getFirstItem(sub: Stripe.Subscription) {
  return sub.items?.data?.[0] || null;
}

function getLatestInvoiceIdFromSub(sub: Stripe.Subscription): string | null {
  const inv = sub.latest_invoice;
  if (!inv) return null;
  return typeof inv === 'string' ? inv : ((inv as any)?.id ?? null);
}

type InvoiceWithPI = Stripe.Invoice & {
  payment_intent?: Stripe.PaymentIntent | string | null;
};

/**
 * Finaliza (se draft) e paga (se open) a latest_invoice da subscription.
 * Se o PaymentIntent precisar de ação (3DS), retorna requiresAction + clientSecret.
 */
async function finalizeAndPayLatestInvoice(sub: Stripe.Subscription): Promise<{
  invoice: InvoiceWithPI | null;
  paymentIntent: Stripe.PaymentIntent | null;
  requiresAction: boolean;
}> {
  const latestInvoiceId = getLatestInvoiceIdFromSub(sub);

  if (!latestInvoiceId) {
    return { invoice: null, paymentIntent: null, requiresAction: false };
  }

  let invoice = (await stripe.invoices.retrieve(latestInvoiceId, {
    expand: ['payment_intent'],
  })) as unknown as InvoiceWithPI;

  if (invoice.status === 'draft') {
    invoice = (await stripe.invoices.finalizeInvoice(latestInvoiceId, {
      expand: ['payment_intent'],
    })) as unknown as InvoiceWithPI;
  }

  const piRaw = invoice.payment_intent ?? null;
  const pi = piRaw && typeof piRaw !== 'string' ? (piRaw as Stripe.PaymentIntent) : null;

  if (pi && (pi.status === 'requires_action' || pi.status === 'requires_payment_method')) {
    return { invoice, paymentIntent: pi, requiresAction: true };
  }

  if (invoice.status === 'open') {
    invoice = (await stripe.invoices.pay(latestInvoiceId, {
      off_session: true,
      expand: ['payment_intent'],
    })) as unknown as InvoiceWithPI;
  }

  const piRaw2 = invoice.payment_intent ?? null;
  const pi2 = piRaw2 && typeof piRaw2 !== 'string' ? (piRaw2 as Stripe.PaymentIntent) : null;

  return { invoice, paymentIntent: pi2, requiresAction: false };
}

/**
 * ✅ Créditos IMEDIATOS (igual Webchat) para WhatsApp
 * - Se período expirou => reseta para o pacote
 * - Se período ativo => soma créditos e reinicia período (30 dias)
 * - Idempotência por purchaseId (invoice.id)
 *
 * OBS: Se seus campos no ConversationQuota forem diferentes, ajuste aqui.
 */
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

async function applyWhatsappCreditsNow(params: {
  username: string;
  packageType: number;
  purchaseId: string; // invoice.id
}) {
  const { username, packageType, purchaseId } = params;

  const pkg = getPackage('whatsapp', packageType);
  if (!pkg) throw new Error('Pacote inválido para crédito (whatsapp).');

  const now = new Date();
  const newStart = now;
  const newEnd = addPeriod(now);

  const current = (await ConversationQuota.findOne({ username }).exec()) as IConversationQuota | null;

  // idempotência
  if ((current as any)?.lastStripeCheckoutId && (current as any).lastStripeCheckoutId === purchaseId) {
    return;
  }

  // Sem quota atual ou expirada => reset
  if (!current || isExpired((current as any).periodEnd)) {
    await ConversationQuota.findOneAndUpdate(
      { username },
      {
        $setOnInsert: { username, createdAt: new Date() },
        $set: {
          packageType,
          totalConversations: pkg.conversations,
          usedConversations: 0, // se existir no seu model
          usedCharacters: 0,    // se existir no seu model
          lastStripeCheckoutId: purchaseId,

          coins: pkg.conversations,
          coinsExpiresAt: newEnd,

          periodStart: newStart,
          periodEnd: newEnd,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    return;
  }

  // Período ativo => soma + reinicia período
  (current as any).totalConversations = ((current as any).totalConversations || 0) + pkg.conversations;
  (current as any).coins = ((current as any).coins || 0) + pkg.conversations;

  (current as any).periodStart = newStart;
  (current as any).periodEnd = newEnd;
  (current as any).coinsExpiresAt = newEnd;

  (current as any).packageType = packageType;
  (current as any).lastStripeCheckoutId = purchaseId;
  (current as any).updatedAt = new Date();

  await (current as any).save();
}

/**
 * POST /api/billing/whatsapp/cancel
 * Cancela no fim do período (mantido)
 */
router.post('/billing/whatsapp/cancel', express.json(), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await ConversationQuota.findOne({ username }).exec()) as IConversationQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const subscription = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Mantive seu comportamento atual
    quota.packageType = null;
    await quota.save();

    return res.json({
      success: true,
      message: 'Assinatura será cancelada ao final do período atual.',
      stripeSubscriptionStatus: subscription.status,
    });
  } catch (err: any) {
    console.error('[whatsapp cancel] erro:', err);
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao cancelar assinatura.';
    return res.status(500).json({ error: stripeMsg });
  }
});

/**
 * POST /api/billing/whatsapp/change-plan
 * Troca plano e cobra IMEDIATAMENTE + aplica créditos IMEDIATAMENTE
 */
router.post('/billing/whatsapp/change-plan', express.json(), async (req: Request, res: Response) => {
  try {
    const { username, newPackageType } = req.body;

    if (!username || newPackageType == null) {
      return res.status(400).json({ error: 'username e newPackageType são obrigatórios.' });
    }

    const quota = (await ConversationQuota.findOne({ username }).exec()) as IConversationQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const pkgNumber = Number(newPackageType);
    if (!Number.isFinite(pkgNumber)) {
      return res.status(400).json({ error: 'newPackageType inválido.' });
    }

    const pkg = getPackage('whatsapp', pkgNumber);
    if (!pkg) return res.status(400).json({ error: 'Pacote inválido.' });

    const subBefore = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
    const item = getFirstItem(subBefore);
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',

      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: pkg.priceId }],

      // ✅ metadata para webhook/diagnóstico
      metadata: {
        username,
        channel: 'whatsapp',
        packageType: String(pkgNumber),
      },

      expand: ['latest_invoice.payment_intent'],
    });

    const payResult = await finalizeAndPayLatestInvoice(updatedSub);

    if (payResult.requiresAction) {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: payResult.paymentIntent?.client_secret,
        message: 'Confirme o pagamento para concluir a troca de plano.',
        stripeSubscriptionStatus: updatedSub.status,
      });
    }

    if (!payResult.invoice) throw new Error('Não foi possível localizar latest_invoice após trocar plano.');

    if (payResult.invoice.status !== 'paid') {
      const piStatus = payResult.paymentIntent?.status ? ` PI=${payResult.paymentIntent.status}` : '';
      throw new Error(`Invoice não ficou paid. status=${payResult.invoice.status}.${piStatus}`);
    }

    const purchaseId = payResult.invoice.id;
    if (!purchaseId) throw new Error('Invoice sem id (purchaseId) — não é possível aplicar créditos.');

    // ✅ créditos na hora (igual primeira compra)
    await applyWhatsappCreditsNow({
      username,
      packageType: pkgNumber,
      purchaseId,
    });

    quota.packageType = pkgNumber;
    (quota as any).updatedAt = new Date();
    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Plano WhatsApp alterado, cobrado e créditos aplicados imediatamente.',
      stripeSubscriptionStatus: updatedSub.status,
    });
  } catch (err: any) {
    console.error('[whatsapp change-plan] erro:', err);
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao mudar de plano.';
    return res.status(500).json({ error: stripeMsg });
  }
});

/**
 * POST /api/billing/whatsapp/renew-now
 * Recompra o MESMO plano e renova AGORA (cobra agora + aplica créditos agora)
 * - proration_behavior: 'none' => cobra o mês cheio agora
 */
router.post('/billing/whatsapp/renew-now', express.json(), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await ConversationQuota.findOne({ username }).exec()) as IConversationQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    const subBefore = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
    const item = getFirstItem(subBefore);
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const priceId = typeof item.price === 'string' ? item.price : (item.price as any).id;

    const currentPkgType = typeof quota.packageType === 'number' ? quota.packageType : null;
    if (!currentPkgType) {
      return res.status(400).json({ error: 'packageType atual indefinido para renovar.' });
    }

    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'none',

      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: priceId }],

      metadata: {
        username,
        channel: 'whatsapp',
        packageType: String(currentPkgType),
      },

      expand: ['latest_invoice.payment_intent'],
    });

    const payResult = await finalizeAndPayLatestInvoice(updatedSub);

    if (payResult.requiresAction) {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: payResult.paymentIntent?.client_secret,
        message: 'Confirme o pagamento para renovar agora.',
        stripeSubscriptionStatus: updatedSub.status,
      });
    }

    if (!payResult.invoice) throw new Error('Não foi possível localizar latest_invoice após renovar.');

    if (payResult.invoice.status !== 'paid') {
      const piStatus = payResult.paymentIntent?.status ? ` PI=${payResult.paymentIntent.status}` : '';
      throw new Error(`Invoice não ficou paid. status=${payResult.invoice.status}.${piStatus}`);
    }

    const purchaseId = payResult.invoice.id;
    if (!purchaseId) throw new Error('Invoice sem id (purchaseId) — não é possível aplicar créditos.');

    await applyWhatsappCreditsNow({
      username,
      packageType: currentPkgType,
      purchaseId,
    });

    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Renovação WhatsApp realizada, cobrada e créditos aplicados imediatamente.',
      stripeSubscriptionStatus: updatedSub.status,
    });
  } catch (err: any) {
    console.error('[whatsapp renew-now] erro:', err);
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao renovar agora.';
    return res.status(500).json({ error: stripeMsg });
  }
});

export default router;
