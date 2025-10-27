// src/infraestructure/express/routes/billingCheckoutUnified.ts
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { getPackage, Channel } from '../../../utils/packages';

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/**
 * POST /api/billing/checkout
 * body: { channel: 'whatsapp' | 'webchat', packageType: number, username: string }
 */
router.post('/billing/checkout', async (req: Request, res: Response) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe não configurado' });

    const { channel, packageType, username } = req.body as {
      channel?: Channel;
      packageType?: number;
      username?: string;
    };

    if (!channel || (channel !== 'whatsapp' && channel !== 'webchat')) {
      return res.status(400).json({ error: 'Canal inválido' });
    }
    if (!username) {
      return res.status(400).json({ error: 'username é obrigatório' });
    }
    if (!Number.isInteger(packageType)) {
      return res.status(400).json({ error: 'packageType inválido' });
    }

    const pkg = getPackage(channel, packageType!);
    if (!pkg) {
      return res.status(400).json({ error: 'Pacote inexistente' });
    }

    // Decide o mode conforme o preço (payment vs subscription)
    const mode = pkg.mode || 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/sucesso?ch=${channel}`,
      cancel_url: `${FRONTEND_URL}/packages?ch=${channel}`,
      metadata: {
        channel,                 // <- fundamental para o webhook saber onde creditar
        username,
        packageType: String(packageType),
      },
      ...(mode === 'subscription'
        ? {
            subscription_data: {
              metadata: {
                channel,
                username,
                packageType: String(packageType),
              },
            },
          }
        : {}),
      allow_promotion_codes: true,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e: any) {
    console.error('[CHECKOUT] erro:', e?.message || e);
    return res.status(500).json({ error: 'Falha ao criar checkout' });
  }
});

export default router;
