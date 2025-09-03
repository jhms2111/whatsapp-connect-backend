// src/infraestructure/express/routes/stripeWebhook.ts
import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import NumberRequest from '../../mongo/models/numberRequestModel';

dotenv.config();

const router = express.Router();

// (opcional) fixe a apiVersion se quiser
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// ⚠️ ESTE router usa express.raw e PRECISA ser montado antes do express.json()
router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string | undefined;

  try {
    if (!sig) return res.status(400).send('Missing stripe-signature');
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    console.log('[BILLING] webhook recebido:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('[BILLING] session.id:', session.id, 'metadata:', session.metadata);

      const nrId = session.metadata?.numberRequestId;
      if (nrId) {
        const nr = await NumberRequest.findById(nrId);
        if (nr) {
          nr.status = 'paid';
          nr.paidAt = new Date();
          if (!nr.checkoutSessionId) nr.checkoutSessionId = session.id;
          await nr.save();
          console.log('✅ NumberRequest marcado como paid:', nr.id);
        } else {
          console.warn('⚠️ numberRequestId não encontrado:', nrId);
        }
      } else {
        console.warn('⚠️ Session sem metadata.numberRequestId');
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error('[BILLING] webhook error:', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// 👇 ESSA LINHA TORNA O ARQUIVO UM MÓDULO
export default router;
