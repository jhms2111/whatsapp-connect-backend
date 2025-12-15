import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

const STRIPE_SECRET_KEY_WHATSAPP =
  process.env.STRIPE_SECRET_KEY_WHATSAPP || process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_SECRET_KEY_WHATSAPP ? new Stripe(STRIPE_SECRET_KEY_WHATSAPP) : null;

type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

function getPriceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const firstItem = sub.items?.data?.[0];
  if (!firstItem) return null;

  const priceAny = firstItem.price as any;
  const priceId =
    (typeof firstItem.price === 'string' ? firstItem.price : priceAny?.id) || null;

  return priceId;
}

/**
 * GET /api/billing/whatsapp/status?username=...
 */
router.get('/billing/whatsapp/status', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string | undefined;

    if (!username) {
      return res.status(400).json({ success: false, error: 'username é obrigatório.' });
    }

    const quota = (await ConversationQuota.findOne({ username }).exec()) as IConversationQuota | null;

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

    let currentPeriodStart: string | null = null;
    let currentPeriodEnd: string | null = null;

    if (quota.stripeSubscriptionId) {
      subscriptionStatus = 'active';

      if (stripe) {
        try {
          const raw = await stripe.subscriptions.retrieve(quota.stripeSubscriptionId);
          const sub = raw as unknown as SubscriptionWithPeriods;

          subscriptionStatus = sub.status;
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;

          if (typeof sub.current_period_start === 'number') {
            currentPeriodStart = new Date(sub.current_period_start * 1000).toISOString();
          }
          if (typeof sub.current_period_end === 'number') {
            currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }

          const priceId = getPriceIdFromSubscription(sub);
          if (priceId) {
            const entries = Object.entries(PACKAGES.whatsapp) as [string, { priceId: string }][];
            for (const [key, pkg] of entries) {
              if (pkg.priceId === priceId) {
                packageType = Number(key);
                break;
              }
            }
          }
        } catch (e) {
          console.error('[whatsapp status] erro ao consultar subscription no Stripe:', e);
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
      nextRenewalAt: currentPeriodEnd,
    });
  } catch (err: any) {
    console.error('[whatsapp status] erro:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
