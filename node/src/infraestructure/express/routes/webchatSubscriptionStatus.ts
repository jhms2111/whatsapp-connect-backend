// src/infraestructure/express/routes/webchatSubscriptionStatus.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();

// 👇 Usa a chave específica do webchat, se existir, senão cai para STRIPE_SECRET_KEY normal
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
      return res
        .status(400)
        .json({ success: false, error: 'username é obrigatório.' });
    }

    // 👇 Tipa explicitamente
    const quota = (await WebchatQuota.findOne({ username }).exec()) as
      | IWebchatQuota
      | null;

    if (!quota) {
      // usuário ainda nunca teve quota de webchat
      return res.json({
        success: true,
        subscriptionStatus: 'none',
        packageType: null,
        cancelAtPeriodEnd: false,
      });
    }

    let subscriptionStatus = 'none';
    let cancelAtPeriodEnd = false;

    // 👉 vamos tentar inferir o packageType de duas formas:
    // 1) do próprio quota.packageType, se existir
    // 2) do price.id da assinatura no Stripe
    let packageType: number | null =
      typeof quota.packageType === 'number' ? quota.packageType : null;

    if (quota.stripeSubscriptionId) {
      // se há uma subscription registrada, assumimos como "active" no mínimo
      subscriptionStatus = 'active';

      if (stripe) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            quota.stripeSubscriptionId
          );
          subscriptionStatus = sub.status;
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;

          // 👇 tenta deduzir o plano pelo price da assinatura
          const firstItem = sub.items.data[0];
          if (firstItem) {
            const priceAny = firstItem.price as any;
            const priceId =
              (typeof firstItem.price === 'string'
                ? firstItem.price
                : priceAny?.id) || null;

            if (priceId) {
              // percorre os pacotes webchat e vê qual tem esse priceId
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
          console.error(
            '[webchat status] erro ao consultar subscription no Stripe:',
            e
          );
          // se Stripe falhar, mantemos "active" (ou o que já tínhamos)
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
    console.error('[webchat status] erro:', err?.message || err);
    return res
      .status(500)
      .json({ success: false, error: 'Erro ao obter status.' });
  }
});

export default router;
