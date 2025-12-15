// src/infraestructure/express/routes/webchatBilling.ts
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

// Tipagem auxiliar: algumas versões do SDK não tipam `payment_intent` em Invoice.
// Com expand, ele existe (string | PaymentIntent | null).
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

  // 1) Busca invoice (com PI expandido)
  let invoice = (await stripe.invoices.retrieve(latestInvoiceId, {
    expand: ['payment_intent'],
  })) as unknown as InvoiceWithPI;

  // 2) Se a invoice estiver draft, precisa finalizar antes de pagar
  if (invoice.status === 'draft') {
    invoice = (await stripe.invoices.finalizeInvoice(latestInvoiceId, {
      expand: ['payment_intent'],
    })) as unknown as InvoiceWithPI;
  }

  const piRaw = invoice.payment_intent ?? null;
  const pi =
    piRaw && typeof piRaw !== 'string' ? (piRaw as Stripe.PaymentIntent) : null;

  // 3) Se o PI requer ação/método, devolve pro front confirmar/atualizar
  if (pi && (pi.status === 'requires_action' || pi.status === 'requires_payment_method')) {
    return { invoice, paymentIntent: pi, requiresAction: true };
  }

  // 4) Se está open, tenta cobrar agora
  if (invoice.status === 'open') {
    invoice = (await stripe.invoices.pay(latestInvoiceId, {
      off_session: true,
      expand: ['payment_intent'],
    })) as unknown as InvoiceWithPI;
  }

  const piRaw2 = invoice.payment_intent ?? null;
  const pi2 =
    piRaw2 && typeof piRaw2 !== 'string' ? (piRaw2 as Stripe.PaymentIntent) : null;

  return { invoice, paymentIntent: pi2, requiresAction: false };
}

/**
 * POST /api/billing/webchat/cancel
 * Cancela no fim do período (mantido)
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

    // Mantive para não quebrar seu comportamento atual
    quota.packageType = null;
    await quota.save();

    return res.json({
      success: true,
      message: 'Assinatura será cancelada ao final do período atual.',
      stripeSubscriptionStatus: sub.status,
    });
  } catch (err: any) {
    console.error('[webchat cancel]', err);
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao cancelar assinatura.';
    return res.status(500).json({ error: stripeMsg });
  }
});

/**
 * POST /api/billing/webchat/change-plan
 * Troca plano e cobra IMEDIATAMENTE (reinicia ciclo agora)
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
    if (!Number.isFinite(pkgNumber)) {
      return res.status(400).json({ error: 'newPackageType inválido.' });
    }

    const pkg = getPackage('webchat', pkgNumber);
    if (!pkg) return res.status(400).json({ error: 'Pacote inválido.' });

    // 1) Recupera a subscription pra pegar o item
    const subBefore = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
    const item = getFirstItem(subBefore);
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    // 2) Atualiza o price e força ciclo agora + proration
    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',

      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: pkg.priceId }],

      // 🔥 metadata p/ webhook (resolve "undefined" no invoice.payment_succeeded)
      metadata: {
        username,
        channel: 'webchat',
        packageType: String(pkgNumber),
      },

      expand: ['latest_invoice.payment_intent'],
    });

    // 3) Finaliza e paga invoice (ou retorna requiresAction)
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

    if (!payResult.invoice) {
      throw new Error('Não foi possível localizar latest_invoice após trocar plano.');
    }

    if (payResult.invoice.status !== 'paid') {
      const piStatus = payResult.paymentIntent?.status ? ` PI=${payResult.paymentIntent.status}` : '';
      throw new Error(`Invoice não ficou paid. status=${payResult.invoice.status}.${piStatus}`);
    }

    // 4) Só depois de pago, grava o plano no Mongo
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
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao mudar de plano.';
    return res.status(500).json({ error: stripeMsg });
  }
});

/**
 * POST /api/billing/webchat/renew-now
 * Renova o MESMO plano e reinicia ciclo AGORA cobrando na hora
 * - proration_behavior: 'none' => cobra o mês inteiro agora, sem crédito do período restante
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
    const item = getFirstItem(subBefore);
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const priceId = typeof item.price === 'string' ? item.price : (item.price as any).id;

    const updatedSub = await stripe.subscriptions.update(quota.stripeSubscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'none',

      payment_behavior: 'default_incomplete',
      items: [{ id: item.id, price: priceId }],

      // 🔥 metadata p/ webhook
      metadata: {
        username,
        channel: 'webchat',
        packageType: String(quota.packageType ?? ''), // mantém o atual (se existir)
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

    if (!payResult.invoice) {
      throw new Error('Não foi possível localizar latest_invoice após renovar.');
    }

    if (payResult.invoice.status !== 'paid') {
      const piStatus = payResult.paymentIntent?.status ? ` PI=${payResult.paymentIntent.status}` : '';
      throw new Error(`Invoice não ficou paid. status=${payResult.invoice.status}.${piStatus}`);
    }

    // Se você quiser resetar quota mensal aqui, faça aqui (depende do seu modelo).
    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Renovação imediata realizada e cobrada com sucesso.',
      stripeSubscriptionStatus: updatedSub.status,
    });
  } catch (err: any) {
    console.error('[webchat renew-now]', err);
    const stripeMsg = err?.raw?.message || err?.message || 'Erro ao renovar agora.';
    return res.status(500).json({ error: stripeMsg });
  }
});

export default router;
