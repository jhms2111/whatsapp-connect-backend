// src/infraestructure/express/routes/checkoutPackage.ts
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { getPackage } from '../../../utils/packages';

dotenv.config();

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
if (!STRIPE_SECRET_KEY) {
  console.warn('[checkoutPackage] STRIPE_SECRET_KEY não configurada — o checkout não funcionará.');
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

type Channel = 'whatsapp' | 'webchat';

/**
 * POST /api/checkout-package
 *
 * body: {
 *   packageType: number;            // 29|59|99 (whatsapp) ou 19|39|79 (webchat)
 *   channel?: "whatsapp"|"webchat"; // default: "whatsapp"
 *   successUrl?: string;
 *   cancelUrl?: string;
 *   username?: string;              // opcional (se quiser permitir compra pública)
 * }
 */
router.post('/checkout-package', async (req: Request, res: Response) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe não configurado no servidor' });
    }

    const {
      packageType,
      channel: rawChannel,
      successUrl,
      cancelUrl,
      username: bodyUsername,
    } = req.body as {
      packageType?: number;
      channel?: Channel;
      successUrl?: string;
      cancelUrl?: string;
      username?: string;
    };

    // username: do token (preferencial) ou permitido via body
    const username =
      (req as any)?.user?.username ||
      (typeof bodyUsername === 'string' ? bodyUsername : '');

    if (!username) {
      return res.status(401).json({ error: 'Usuário não autenticado (username ausente)' });
    }

    if (!Number.isInteger(packageType)) {
      return res.status(400).json({ error: 'packageType inválido' });
    }

    // canal padrão = whatsapp
    const channel: Channel = rawChannel === 'webchat' ? 'webchat' : 'whatsapp';

    // Busca o pacote via helper unificado (NÃO indexe PACKAGES diretamente)
    const pkg = getPackage(channel, packageType as number);
    if (!pkg) {
      return res.status(400).json({ error: 'Pacote inexistente para este canal' });
    }

    // Define o modo conforme o pacote (payment vs subscription)
    const mode: 'payment' | 'subscription' =
      (pkg.mode as any) === 'subscription' ? 'subscription' : 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [
        {
          price: pkg.priceId,
          quantity: 1,
        },
      ],
      success_url:
        successUrl ||
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success?ch=${channel}`,
      cancel_url:
        cancelUrl ||
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/packages`,
      metadata: {
        channel,                      // <- o webhook usa isso para saber se é whatsapp ou webchat
        username,
        packageType: String(packageType),
      },
      allow_promotion_codes: true,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e: any) {
    console.error('[checkoutPackage] erro:', e?.message || e);
    // mensagem de erro amigável quando o price do Stripe é recorrente e o modo é payment
    if (
      typeof e?.message === 'string' &&
      e.message.includes('You specified `payment` mode but passed a recurring price')
    ) {
      return res.status(500).json({
        error:
          'O preço configurado no Stripe é recorrente, mas o checkout está em modo pagamento. Altere o pacote para mode:"subscription" ou use um price de pagamento único.',
      });
    }
    return res.status(500).json({ error: 'Falha ao criar checkout' });
  }
});

export default router;
