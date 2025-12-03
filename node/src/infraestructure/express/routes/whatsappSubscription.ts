import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import { PACKAGES, getPackage } from '../../../utils/packages';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: '2023-10-16',
});

/**
 * GET /api/billing/whatsapp/status?username=fulano
 *
 * Retorna:
 * {
 *   success: boolean;
 *   subscriptionStatus: string;      // 'active', 'canceled', 'none', etc.
 *   cancelAtPeriodEnd: boolean;
 *   packageType: number | null;      // 29 | 59 | 99 | null
 * }
 */
router.get(
  '/billing/whatsapp/status',
  async (req: Request, res: Response) => {
    try {
      const username = String(req.query.username || '').trim();

      if (!username) {
        return res
          .status(400)
          .json({ success: false, error: 'username é obrigatório.' });
      }

      const quota = (await ConversationQuota.findOne({ username }).exec()) as
        | IConversationQuota
        | null;

      // se não tem quota, usuário nunca comprou nada
      if (!quota) {
        return res.json({
          success: true,
          subscriptionStatus: 'none',
          cancelAtPeriodEnd: false,
          packageType: null,
        });
      }

      let subscriptionStatus = 'none';
      let cancelAtPeriodEnd = false;

      // tenta primeiro a partir do Mongo
      let packageType: number | null =
        typeof quota.packageType === 'number' ? quota.packageType : null;

      if (quota.stripeSubscriptionId) {
        // se tem subscription, no mínimo consideramos "active"
        subscriptionStatus = 'active';

        try {
          const sub = await stripe.subscriptions.retrieve(
            quota.stripeSubscriptionId
          );

          subscriptionStatus = sub.status || 'active';
          cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);

          // deduzir packageType pelo priceId
          const firstItem = sub.items.data[0];
          if (firstItem) {
            const priceAny = firstItem.price as any;
            const priceId =
              (typeof firstItem.price === 'string'
                ? firstItem.price
                : priceAny?.id) || null;

            if (priceId) {
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
        } catch (err) {
          console.error(
            '[whatsapp status] erro ao consultar subscription no Stripe:',
            (err as any)?.message || err
          );
          // se Stripe falhar, mantemos o que já tínhamos
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
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar status da assinatura.',
      });
    }
  }
);

// POST /api/billing/whatsapp/cancel
router.post(
  '/billing/whatsapp/cancel',
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'username é obrigatório.' });
      }

      const quota = (await ConversationQuota.findOne({ username }).exec()) as
        | IConversationQuota
        | null;

      if (!quota || !quota.stripeSubscriptionId) {
        return res
          .status(404)
          .json({ error: 'Assinatura não encontrada para este usuário.' });
      }

      const subscriptionId = quota.stripeSubscriptionId;

      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      // opcional: limpar packageType (igual você fez no Webchat)
      quota.packageType = null;
      await quota.save();

      return res.json({
        success: true,
        message: 'Assinatura será cancelada ao final do período atual.',
        stripeSubscriptionStatus: subscription.status,
      });
    } catch (err: any) {
      console.error('[whatsapp cancel] erro:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
    }
  }
);

// POST /api/billing/whatsapp/change-plan
router.post(
  '/billing/whatsapp/change-plan',
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const { username, newPackageType } = req.body;

      if (!username || newPackageType == null) {
        return res
          .status(400)
          .json({ error: 'username e newPackageType são obrigatórios.' });
      }

      const quota = (await ConversationQuota.findOne({ username }).exec()) as
        | IConversationQuota
        | null;

      if (!quota || !quota.stripeSubscriptionId) {
        return res
          .status(404)
          .json({ error: 'Assinatura não encontrada para este usuário.' });
      }

      const pkgNumber = Number(newPackageType);
      if (!Number.isFinite(pkgNumber)) {
        return res.status(400).json({ error: 'newPackageType inválido.' });
      }

      const pkg = getPackage('whatsapp', pkgNumber);
      if (!pkg) {
        return res.status(400).json({ error: 'Pacote inválido.' });
      }

      const subscriptionId = quota.stripeSubscriptionId;

      // 1) Recupera a subscription
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
        proration_behavior: 'create_prorations',
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
      console.error('[whatsapp change-plan] erro:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao mudar de plano.' });
    }
  }
);

export default router;
