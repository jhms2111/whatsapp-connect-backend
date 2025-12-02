import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT = process.env.STRIPE_SECRET_KEY_WEBCHAT || '';
const stripe = STRIPE_SECRET_KEY_WEBCHAT ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT) : null;

/**
 * GET /api/webchat/status?username=...
 */
router.get('/webchat/status', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string | undefined;
    if (!username) {
      return res
        .status(400)
        .json({ success: false, error: 'username é obrigatório.' });
    }

    // 👇 tipagem explícita como IWebchatQuota | null
    const quota = (await WebchatQuota.findOne({ username }).lean().exec()) as
      | IWebchatQuota
      | null;

    if (!quota) {
      // mesmo sem assinatura, retornamos 200 com status "none"
      return res.json({
        success: true,
        subscriptionStatus: 'none',
        packageType: null,
        cancelAtPeriodEnd: false,
      });
    }

    let subscriptionStatus = 'unknown';
    let cancelAtPeriodEnd = false;

    if (stripe && quota.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
        subscriptionStatus = sub.status;
        cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      } catch (e) {
        console.error('[webchat status] erro ao consultar subscription no Stripe:', e);
      }
    } else {
      // se não tem stripeSubscriptionId salvo, consideramos "none"
      subscriptionStatus = 'none';
    }

    return res.json({
      success: true,
      subscriptionStatus,
      packageType: quota.packageType ?? null,
      cancelAtPeriodEnd,
    });
  } catch (err: any) {
    console.error('[webchat status] erro:', err?.message || err);
    return res
      .status(500)
      .json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
