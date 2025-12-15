// src/infraestructure/express/routes/webchatSubscriptionStatus.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WEBCHAT =
  process.env.STRIPE_SECRET_KEY_WEBCHAT || process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_SECRET_KEY_WEBCHAT ? new Stripe(STRIPE_SECRET_KEY_WEBCHAT) : null;

// Tipagem auxiliar (por causa de typings do SDK em algumas versões)
type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

function getPriceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const firstItem = sub.items?.data?.[0];
  if (!firstItem) return null;

  // pode vir string (id) ou objeto Price
  const p: any = firstItem.price;
  if (typeof p === 'string') return p;
  if (p?.id) return String(p.id);

  return null;
}

/**
 * GET /api/webchat/status?username=...
 */
router.get('/webchat/status', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string | undefined;
    if (!username) {
      return res.status(400).json({ success: false, error: 'username é obrigatório.' });
    }

    const quota = (await WebchatQuota.findOne({ username }).exec()) as IWebchatQuota | null;

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

    let packageType: number | null =
      typeof quota.packageType === 'number' ? quota.packageType : null;

    // ✅ unix seconds
    let currentPeriodStart: number | null = null;
    let currentPeriodEnd: number | null = null;

    if (quota.stripeSubscriptionId) {
      subscriptionStatus = 'active';

      if (stripe) {
        try {
          const raw = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);

          const sub = raw as unknown as SubscriptionWithPeriods;

          subscriptionStatus = sub.status;
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;

          // ✅ pega as datas direto como unix seconds
          if (typeof sub.current_period_start === 'number') {
            currentPeriodStart = sub.current_period_start;
          }
          if (typeof sub.current_period_end === 'number') {
            currentPeriodEnd = sub.current_period_end;
          }

          // tenta deduzir packageType pelo priceId
          const priceId = getPriceIdFromSubscription(sub);
          if (priceId) {
            const entries = Object.entries(PACKAGES.webchat) as [string, { priceId: string }][];
            for (const [key, pkg] of entries) {
              if (pkg.priceId === priceId) {
                packageType = Number(key);
                break;
              }
            }
          }
        } catch (e) {
          console.error('[webchat status] erro ao consultar subscription no Stripe:', e);
        }
      } else {
        console.error('[webchat status] Stripe client não inicializado: STRIPE_SECRET_KEY_WEBCHAT/STRIPE_SECRET_KEY vazia.');
      }
    }

    return res.json({
      success: true,
      subscriptionStatus,
      packageType: packageType ?? null,
      cancelAtPeriodEnd,
      currentPeriodStart,
      currentPeriodEnd,
      nextRenewalAt: currentPeriodEnd,
    });
  } catch (err: any) {
    console.error('[webchat status] erro:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
