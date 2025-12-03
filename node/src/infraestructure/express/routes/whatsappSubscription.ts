// src/infraestructure/express/routes/whatsappSubscription.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import ConversationQuota, { IConversationQuota } from '../../mongo/models/conversationQuotaModel';
import { getPackage } from '../../../utils/packages';

const router = express.Router();

// Stripe unificado
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: '2023-10-16',
});

/**
 * GET /api/billing/whatsapp/status
 * Query: ?username=fulano
 *
 * Retorna:
 * {
 *   success: boolean;
 *   subscriptionStatus: string;      // ex: 'active', 'canceled', ''
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
        return res.status(400).json({ success: false, error: 'username é obrigatório.' });
      }

      const quota = (await ConversationQuota.findOne({ username }).exec()) as
        | IConversationQuota
        | null;

      // Se não tem quota, ou não tem stripeSubscriptionId, devolve "sem assinatura"
      if (!quota || !quota.stripeSubscriptionId) {
        return res.json({
          success: true,
          subscriptionStatus: '',
          cancelAtPeriodEnd: false,
          packageType: quota?.packageType ?? null,
        });
      }

      const subscriptionId = quota.stripeSubscriptionId;

      // Busca status atual no Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      return res.json({
        success: true,
        subscriptionStatus: subscription.status || '',
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        packageType: quota.packageType ?? null,
      });
    } catch (err: any) {
      console.error('[whatsapp status] erro:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Erro ao buscar status da assinatura.' });
    }
  }
);

// POST /api/billing/whatsapp/cancel
router.post('/billing/whatsapp/cancel', express.json(), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'username é obrigatório.' });
    }

    const quota = (await ConversationQuota.findOne({ username }).exec()) as
      | IConversationQuota
      | null;

    if (!quota || !quota.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
    }

    const subscriptionId = quota.stripeSubscriptionId;

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // opcional: limpar packageType, se quiser
    quota.packageType = null as any;
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
});

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
        return res.status(404).json({ error: 'Assinatura não encontrada para este usuário.' });
      }

      const pkgNumber = Number(newPackageType);
      if (!Number.isFinite(pkgNumber)) {
        return res.status(400).json({ error: 'newPackageType inválido.' });
      }

      // Pega o pacote do canal whatsapp
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
      quota.packageType = pkgNumber as any;
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
