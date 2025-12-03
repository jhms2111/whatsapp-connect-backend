import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

// Pode usar uma chave específica para WhatsApp ou cair no STRIPE_SECRET_KEY padrão
const STRIPE_SECRET_KEY_WHATSAPP =
  process.env.STRIPE_SECRET_KEY_WHATSAPP || process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_SECRET_KEY_WHATSAPP
  ? new Stripe(STRIPE_SECRET_KEY_WHATSAPP)
  : null;

/**
 * GET /api/billing/whatsapp/status?username=...
 *
 * Resposta:
 * {
 *   success: true,
 *   subscriptionStatus: 'none' | 'active' | 'canceled' | ...,
 *   packageType: number | null,      // 29 | 59 | 99...
 *   cancelAtPeriodEnd: boolean
 * }
 */
router.get('/billing/whatsapp/status', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string | undefined;

    if (!username) {
      return res
        .status(400)
        .json({ success: false, error: 'username é obrigatório.' });
    }

    const quota = (await ConversationQuota.findOne({ username }).exec()) as
      | IConversationQuota
      | null;

    if (!quota) {
      // usuário nunca teve registro de quota/assinatura WhatsApp
      return res.json({
        success: true,
        subscriptionStatus: 'none',
        packageType: null,
        cancelAtPeriodEnd: false,
      });
    }

    let subscriptionStatus = 'none';
    let cancelAtPeriodEnd = false;

    // tenta pegar packageType direto do Mongo
    let packageType: number | null =
      typeof quota.packageType === 'number' ? quota.packageType : null;

    if (quota.stripeSubscriptionId) {
      // se há uma subscription registrada, assumimos pelo menos "active"
      subscriptionStatus = 'active';

      if (stripe) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            quota.stripeSubscriptionId
          );

          subscriptionStatus = sub.status;
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;

          // tenta deduzir o plano pelo priceId do item
          const firstItem = sub.items.data[0];
          if (firstItem) {
            const priceAny = firstItem.price as any;
            const priceId =
              (typeof firstItem.price === 'string'
                ? firstItem.price
                : priceAny?.id) || null;

            if (priceId) {
              // percorre pacotes do canal whatsapp
              const entries = Object.entries(PACKAGES.whatsapp) as [
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
          console.error(
            '[whatsapp status] erro ao consultar subscription no Stripe:',
            e
          );
          // se Stripe falhar, mantém o que tinha
        }
      }
    }

    return res.json({
      success: true,
      subscriptionStatus,
      packageType: packageType ?? null,
      cancelAtPeriodEnd,
    });
  } catch (err: any) {
    console.error('[whatsapp status] erro:', err?.message || err);
    return res
      .status(500)
      .json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
