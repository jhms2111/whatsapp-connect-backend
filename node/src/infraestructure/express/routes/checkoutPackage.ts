// src/infraestructure/express/routes/stripePackageWebhook.ts
import express from 'express';
import Stripe from 'stripe';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';
import { PACKAGES } from '../../../utils/packages';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// ⚠️ NÃO use express.json() aqui
router.post('/checkout-package', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  try {
    if (!sig) return res.status(400).send('Missing stripe-signature');

    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('[BILLING] webhook:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const username = session.metadata?.username?.trim();
      const packageTypeStr = session.metadata?.packageType;
      const packageType = Number(packageTypeStr) as keyof typeof PACKAGES;

      if (!username || !packageType || !PACKAGES[packageType]) {
        return res.status(400).send('Metadata/pacote inválido');
      }

      const pacote = PACKAGES[packageType];

      // Ativa/Reseta o pacote SEM créditos extras
      const updated = await ConversationQuota.findOneAndUpdate(
        { username },
        {
          $setOnInsert: { username, createdAt: new Date() },
          $set: {
            totalConversations: pacote.conversations, // 29→200, 59→500, 99→1250
            usedCharacters: 0,                        // zera consumo
            packageType: Number(packageType),
            lastStripeCheckoutId: session.id,
            updatedAt: new Date(),
          },
        },
        { new: true, upsert: true }
      ).lean();

      console.log(`✅ Pacote €${pacote.priceEuros} (${pacote.conversations} conv.) ativado para ${username}`);
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error('[BILLING] webhook error:', err?.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
