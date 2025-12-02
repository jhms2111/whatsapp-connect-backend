import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { getPackage } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT = process.env.STRIPE_SECRET_KEY_WEBCHAT || '';
const stripe = STRIPE_SECRET_KEY_WEBCHAT ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT) : null;

// POST /api/billing/webchat/cancel
router.post('/billing/webchat/cancel', express.json(), async (req: Request, res: Response) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe não configurado.' });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'username é obrigatório.' });
    }

    // 👇 tipamos explicitamente o retorno como IWebchatQuota | null
    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;

    if (!quota || !quota.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const subscriptionId = quota.stripeSubscriptionId;

    // Cancela no fim do período atual
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Opcional: refletir algo no Mongo (por ex, limpar packageType)
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

// POST /api/billing/webchat/change-plan
router.post('/billing/webchat/change-plan', express.json(), async (req: Request, res: Response) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe não configurado.' });
    }

    const { username, newPackageType } = req.body;

    if (!username || newPackageType == null) {
      return res
        .status(400)
        .json({ error: 'username e newPackageType são obrigatórios.' });
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
    if (!item) {
      return res.status(500).json({ error: 'Subscription sem items.' });
    }

    // 2) Atualiza o item com o novo priceId
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: item.id,
          price: pkg.priceId,
        },
      ],
      proration_behavior: 'create_prorations', // Stripe calcula diferença proporcional
    });

    // 3) Atualiza info no Mongo
    quota.packageType = pkgNumber;
    await quota.save();

    return res.json({
      success: true,
      message: 'Plano alterado com sucesso.',
      stripeSubscriptionStatus: updated.status,
    });
  } catch (err: any) {
    console.error('[webchat change-plan] erro:', err?.message || err);
    return res.status(500).json({ error: 'Erro ao mudar de plano.' });
  }
});

export default router;
