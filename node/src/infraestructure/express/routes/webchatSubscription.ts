import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { getPackage } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT =
  process.env.STRIPE_SECRET_KEY_WEBCHAT || process.env.STRIPE_SECRET_KEY || '';

if (!STRIPE_SECRET_KEY_WEBCHAT) {
  throw new Error('STRIPE_SECRET_KEY_WEBCHAT não configurada');
}

const stripe = new Stripe(STRIPE_SECRET_KEY_WEBCHAT, {
  // apiVersion: '2023-10-16',
});

/**
 * Utils
 */
function getLatestInvoiceId(sub: Stripe.Subscription): string | null {
  const inv = sub.latest_invoice;
  if (!inv) return null;
  return typeof inv === 'string' ? inv : (inv as any).id ?? null;
}

function getPaymentIntentFromSub(
  sub: Stripe.Subscription
): Stripe.PaymentIntent | null {
  return ((sub.latest_invoice as any)?.payment_intent as Stripe.PaymentIntent) || null;
}

/**
 * POST /api/billing/webchat/cancel
 * Cancela no fim do período
 */
router.post('/billing/webchat/cancel', express.json(), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    const sub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    quota.packageType = null;
    await quota.save();

    return res.json({
      success: true,
      message: 'Assinatura será cancelada ao final do período atual.',
      stripeSubscriptionStatus: sub.status,
    });
  } catch (err: any) {
    console.error('[webchat cancel]', err);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
});

/**
 * POST /api/billing/webchat/change-plan
 * Troca plano e cobra IMEDIATAMENTE
 */
router.post('/billing/webchat/change-plan', express.json(), async (req: Request, res: Response) => {
  try {
    const { username, newPackageType } = req.body;

    if (!username || newPackageType == null) {
      return res.status(400).json({ error: 'username e newPackageType são obrigatórios.' });
    }

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    const pkgNumber = Number(newPackageType);
    const pkg = getPackage('webchat', pkgNumber);
    if (!pkg) return res.status(400).json({ error: 'Pacote inválido.' });

    const subBefore = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
    const item = subBefore.items.data[0];
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',
      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: pkg.priceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    const pi = getPaymentIntentFromSub(updatedSub);
    const latestInvoiceId = getLatestInvoiceId(updatedSub);

    // 🔴 Se precisa ação (3DS)
    if (pi && pi.status === 'requires_action') {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: pi.client_secret,
        message: 'Confirme o pagamento para concluir a troca de plano.',
      });
    }

    // 🔥 Força pagamento da invoice
    if (latestInvoiceId) {
      await stripe.invoices.pay(latestInvoiceId, { off_session: true });
    }

    quota.packageType = pkgNumber;
    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Plano alterado e cobrado imediatamente.',
      stripeSubscriptionStatus: updatedSub.status,
    });
  } catch (err: any) {
    console.error('[webchat change-plan]', err);
    return res.status(500).json({ error: 'Erro ao mudar de plano.' });
  }
});

/**
 * POST /api/billing/webchat/renew-now
 * Recompra o MESMO plano e renova AGORA
 */
router.post('/billing/webchat/renew-now', express.json(), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    const subBefore = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
    const item = subBefore.items.data[0];
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const priceId =
      typeof item.price === 'string' ? item.price : (item.price as any).id;

    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'none',
      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: priceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    const pi = getPaymentIntentFromSub(updatedSub);
    const latestInvoiceId = getLatestInvoiceId(updatedSub);

    if (pi && pi.status === 'requires_action') {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: pi.client_secret,
        message: 'Confirme o pagamento para renovar agora.',
      });
    }

    if (latestInvoiceId) {
      await stripe.invoices.pay(latestInvoiceId, { off_session: true });
    }

    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Renovação imediata realizada e cobrada com sucesso.',
      stripeSubscriptionStatus: updatedSub.status,
    });
  } catch (err: any) {
    console.error('[webchat renew-now]', err);
    return res.status(500).json({ error: 'Erro ao renovar agora.' });
  }
});

export default router;
