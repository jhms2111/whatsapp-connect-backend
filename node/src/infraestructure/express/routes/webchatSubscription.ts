// src/infraestructure/express/routes/webchatBilling.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { getPackage, PACKAGES } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT =
  process.env.STRIPE_SECRET_KEY_WEBCHAT || process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_SECRET_KEY_WEBCHAT
  ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT, {
      // apiVersion: '2023-10-16',
    })
  : null;

// (você declarou, mas não está usando aqui — removi pra não ficar “lixo” no arquivo)
// const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Helpers
 */
function isActiveLike(status?: string | null) {
  // consideramos “tem assinatura” se estiver ativa/“quase ativa”
  // ajuste se você quiser incluir outros estados
  return !!status && status !== 'canceled' && status !== 'incomplete_expired';
}

function getPriceIdFromItem(item: Stripe.SubscriptionItem) {
  const priceAny = item.price as any;
  return (typeof item.price === 'string' ? item.price : priceAny?.id) as string | undefined;
}

/**
 * POST /api/billing/webchat/cancel
 * Mantém a funcionalidade antiga: cancelar no fim do período.
 *
 * ⚠️ Observação: limpar packageType aqui pode confundir status se a assinatura ainda está ativa até o fim.
 * Mantive como você tinha para não quebrar o comportamento atual.
 */
router.post('/billing/webchat/cancel', express.json(), async (req: Request, res: Response) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe não configurado.' });

    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota || !quota.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const subscriptionId = quota.stripeSubscriptionId;

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Mantive exatamente como estava (mas considere não limpar se quiser consistência)
    quota.packageType = null;
    await quota.save();

    return res.json({
      success: true,
      message: 'Assinatura será cancelada ao final do período atual.',
      stripeSubscriptionStatus: subscription.status,
    });
  } catch (err: any) {
    console.error('[webchat cancel] erro:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
});

/**
 * POST /api/billing/webchat/change-plan
 * Troca plano e COBRA IMEDIATAMENTE (sem esperar o fim do período).
 *
 * - billing_cycle_anchor: 'now'      -> reinicia o ciclo agora
 * - proration_behavior: 'create_prorations' -> cobra diferença proporcional agora
 * - payment_behavior: 'default_incomplete'  -> gera PaymentIntent e pode exigir 3DS
 *
 * Mantém a funcionalidade antiga de “mudar plano”, só que agora imediato.
 */
router.post('/billing/webchat/change-plan', express.json(), async (req: Request, res: Response) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe não configurado.' });

    const { username, newPackageType } = req.body;

    if (!username || newPackageType == null) {
      return res.status(400).json({ error: 'username e newPackageType são obrigatórios.' });
    }

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota || !quota.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const pkgNumber = Number(newPackageType);
    if (!Number.isFinite(pkgNumber)) {
      return res.status(400).json({ error: 'newPackageType inválido.' });
    }

    const pkg = getPackage('webchat', pkgNumber);
    if (!pkg) {
      return res.status(400).json({ error: 'Pacote inválido.' });
    }

    const subscriptionId = quota.stripeSubscriptionId;

    // 1) Recupera a subscription pra pegar o item
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    // 2) Atualiza o price e força cobrança imediata
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',
      items: [{ id: item.id, price: pkg.priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const pi = (updated.latest_invoice as any)?.payment_intent as Stripe.PaymentIntent | undefined;

    // 3) Se precisar de ação (3DS), o front confirma com clientSecret
    if (pi && pi.status === 'requires_action') {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: pi.client_secret,
        stripeSubscriptionStatus: updated.status,
        message: 'Confirme o pagamento para concluir a troca de plano.',
      });
    }

    // 4) Se já pagou / não precisa ação, aplica no Mongo
    quota.packageType = pkgNumber;
    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Plano alterado e cobrado imediatamente.',
      stripeSubscriptionStatus: updated.status,
    });
  } catch (err: any) {
    console.error('[webchat change-plan] erro:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao mudar de plano.' });
  }
});

/**
 * POST /api/billing/webchat/renew-now
 * “Recomprar o MESMO pacote” para RENOVAR AGORA, cobrando na hora,
 * mesmo que ainda esteja no meio do mês.
 *
 * Regras:
 * - Mantém o mesmo price atual (mesmo plano)
 * - billing_cycle_anchor: 'now' -> reinicia ciclo agora
 * - proration_behavior: 'none'  -> cobra o período inteiro agora (sem crédito do tempo restante)
 *
 * ⚠️ Se você preferir cobrar “diferença proporcional” em vez de mês cheio,
 * troque proration_behavior para 'create_prorations'.
 */
router.post('/billing/webchat/renew-now', express.json(), async (req: Request, res: Response) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe não configurado.' });

    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username é obrigatório.' });

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;
    if (!quota || !quota.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const subscriptionId = quota.stripeSubscriptionId;

    // Recupera a subscription e o item atual
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    if (!item) return res.status(500).json({ error: 'Subscription sem items.' });

    const currentPriceId = getPriceIdFromItem(item);
    if (!currentPriceId) return res.status(500).json({ error: 'Não foi possível obter o price atual.' });

    // Renova agora (mesmo plano), cobrando agora
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      billing_cycle_anchor: 'now',
      proration_behavior: 'none',
      items: [{ id: item.id, price: currentPriceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const pi = (updated.latest_invoice as any)?.payment_intent as Stripe.PaymentIntent | undefined;

    if (pi && pi.status === 'requires_action') {
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: pi.client_secret,
        stripeSubscriptionStatus: updated.status,
        message: 'Confirme o pagamento para renovar agora.',
      });
    }

    // Aqui você pode “resetar” sua quota mensal se quiser.
    // Como você não mostrou os campos (remaining/used/etc),
    // mantive só o save para persistir qualquer ajuste futuro.
    //
    // Exemplo (se existirem campos):
    // const pkgType = quota.packageType ?? null;
    // if (pkgType && PACKAGES.webchat[pkgType]) {
    //   quota.remainingConversations = PACKAGES.webchat[pkgType].conversations;
    //   quota.usedConversations = 0;
    // }
    await quota.save();

    return res.json({
      success: true,
      requiresAction: false,
      message: 'Renovação imediata realizada e cobrada na hora.',
      stripeSubscriptionStatus: updated.status,
    });
  } catch (err: any) {
    console.error('[webchat renew-now] erro:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao renovar agora.' });
  }
});

export default router;
