import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT =
  process.env.STRIPE_SECRET_KEY_WEBCHAT || process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_SECRET_KEY_WEBCHAT
  ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT)
  : null;

/**
 * GET /api/webchat/status?username=...
 */
router.get('/webchat/status', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string | undefined;
    if (!username) {
      return res.status(400).json({ success: false, error: 'username é obrigatório.' });
    }

    const quota = (await WebchatQuota.findOne({ username }).exec()) as
      | IWebchatQuota
      | null;

    if (!quota) {
      return res.json({
        success: true,
        subscriptionStatus: 'none',
        packageType: null,
        cancelAtPeriodEnd: false,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextRenewalAt: null,
      });
    }

    let subscriptionStatus = 'none';
    let cancelAtPeriodEnd = false;

    // packageType via Mongo (se tiver)
    let packageType: number | null =
      typeof quota.packageType === 'number' ? quota.packageType : null;

    // 👇 NOVO: datas do ciclo (Stripe)
    let currentPeriodStart: string | null = null; // ISO
    let currentPeriodEnd: string | null = null;   // ISO

    if (quota.stripeSubscriptionId) {
      subscriptionStatus = 'active';

      if (stripe) {
        try {
          const sub = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);

          subscriptionStatus = sub.status;
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;

          // ✅ pega as datas (UNIX seconds -> ISO string)
          if (typeof sub.current_period_start === 'number') {
            currentPeriodStart = new Date(sub.current_period_start * 1000).toISOString();
          }
          if (typeof sub.current_period_end === 'number') {
            currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }

          // tenta deduzir packageType pelo priceId da assinatura
          const firstItem = sub.items.data[0];
          if (firstItem) {
            const priceAny = firstItem.price as any;
            const priceId =
              (typeof firstItem.price === 'string'
                ? firstItem.price
                : priceAny?.id) || null;

            if (priceId) {
              const entries = Object.entries(PACKAGES.webchat) as [
                string,
                { priceId: string }
              ][];

              for (const [key, pkg] of entries) {
                if (pkg.priceId === priceId) {
                  packageType = Number(key);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error('[webchat status] erro ao consultar subscription no Stripe:', e);
          // se Stripe falhar, mantemos o que temos do Mongo
        }
      }
    }

    return res.json({
      success: true,
      subscriptionStatus,
      packageType: packageType ?? null,
      cancelAtPeriodEnd,
      currentPeriodStart,
      currentPeriodEnd,
      nextRenewalAt: currentPeriodEnd, // alias pra facilitar no front
    });
  } catch (err: any) {
    console.error('[webchat status] erro:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
