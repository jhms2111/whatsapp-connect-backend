// src/infraestructure/express/routes/checkoutPackageRoutes.ts
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { getPackage } from '../../../utils/packages';

dotenv.config();

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
if (!STRIPE_SECRET_KEY) {
  console.warn('[checkout] STRIPE_SECRET_KEY não configurada — checkout não funcionará.');
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Tipos aceitos para o canal
type Channel = 'whatsapp' | 'webchat';

/**
 * (LEGADO/COMPATIBILIDADE)
 * POST /api/checkout-package
 *
 * body: {
 *   packageType: number;            // 29|59|99 (whatsapp) ou 19|39|79 (webchat), conforme utils/packages.ts
 *   channel?: "whatsapp"|"webchat"; // default: "whatsapp"
 *   successUrl?: string;
 *   cancelUrl?: string;
 *   // opcional: username se quiser permitir compra pública sem token
 * }
 *
 * Observação:
 * - Se você já está usando /api/billing/checkout-package, pode manter ambos funcionando
 *   (este usa a mesma lógica unificada para eliminar TS erros).
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
    } = req.body as {
      packageType?: number;
      channel?: Channel;
      successUrl?: string;
      cancelUrl?: string;
    };

    // username preferencialmente do token
    const username =
      (req as any)?.user?.username ||
      (typeof req.body?.username === 'string' ? req.body.username : '');

    if (!username) {
      return res.status(401).json({ error: 'Usuário não autenticado (username ausente)' });
    }

    // Canal padrão = whatsapp (sem conversão numérica!)
    const channel: Channel = rawChannel === 'webchat' ? 'webchat' : 'whatsapp';

    if (!Number.isInteger(packageType)) {
      return res.status(400).json({ error: 'packageType inválido' });
    }

    // Busca o pacote unificado conforme canal
    const pkg = getPackage(channel, packageType as number);
    if (!pkg) {
      return res.status(400).json({ error: 'Pacote inexistente para este canal' });
    }

    // Define o modo do checkout: 'payment' (one-time) ou 'subscription' (recorrente)
    const mode: 'payment' | 'subscription' = (pkg.mode as any) === 'subscription' ? 'subscription' : 'payment';

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
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sucesso?ch=${channel}`,
      cancel_url:
        cancelUrl ||
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/packages`,
      metadata: {
        channel,                      // <- importantíssimo pro webhook diferenciar
        username,
        packageType: String(packageType),
      },
      allow_promotion_codes: true,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e: any) {
    console.error('[checkout][legacy] erro:', e?.message || e);
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
