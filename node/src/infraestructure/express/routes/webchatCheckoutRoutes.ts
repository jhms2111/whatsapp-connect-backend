//webchatCheckoutRoutes.ts

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

import WebchatQuota from '../../mongo/models/webchatQuotaModel';
import { WEBCHAT_PACKAGES, WebchatPackageType } from '../../../utils/webchatPackages';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY não configurada');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string /* , { apiVersion: '2023-10-16' } */);
const router = Router();

/**
 * Alias 1 (mantém seu endpoint existente):
 * POST /api/webchat/checkout-session
 * body: { packageType: number, username: string, successUrl?: string, cancelUrl?: string }
 */
router.post('/webchat/checkout-session', async (req: Request, res: Response) => {
  try {
    const { packageType, username, successUrl, cancelUrl } = req.body as {
      packageType?: number;
      username?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!username) return res.status(400).json({ error: 'username é obrigatório' });
    if (!Number.isInteger(packageType)) return res.status(400).json({ error: 'packageType inválido' });

    const key = packageType as WebchatPackageType;
    if (!(key in WEBCHAT_PACKAGES)) return res.status(400).json({ error: 'Pacote inexistente' });

    const pkg = WEBCHAT_PACKAGES[key];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success?ch=webchat`,
      cancel_url:  cancelUrl  || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/webchat-packages?cancel=1`,
      metadata: {
        username,
        channel: 'webchat',                 // <- para o webhook diferenciar
        packageType: String(packageType),
      },
      allow_promotion_codes: true,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (e: any) {
    console.error('[WEBCHAT CHECKOUT-SESSION] erro:', e?.message || e);
    return res.status(500).json({ error: 'Falha ao criar checkout' });
  }
});

/**
 * Alias 2 (o que o seu front chama):
 * POST /api/billing/webchat/checkout
 * body: { packageType: number }
 * Requer JWT (usa req.user.username)
 */
router.post('/billing/webchat/checkout', async (req: Request, res: Response) => {
  try {
    const u = (req as any).user;
    if (!u?.username) return res.status(401).json({ error: 'Unauthorized' });

    const { packageType } = req.body as { packageType?: number };
    if (!Number.isInteger(packageType)) return res.status(400).json({ error: 'packageType inválido' });

    const key = packageType as WebchatPackageType;
    if (!(key in WEBCHAT_PACKAGES)) return res.status(400).json({ error: 'Pacote inexistente' });

    const pkg = WEBCHAT_PACKAGES[key];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success?ch=webchat`,
      cancel_url:  `${process.env.FRONTEND_URL || 'http://localhost:3000'}/webchat-packages?cancel=1`,
      metadata: {
        username: u.username,
        channel: 'webchat',
        packageType: String(packageType),
      },
      allow_promotion_codes: true,
    });

    return res.json({ url: session.url });
  } catch (e: any) {
    console.error('[WEBCHAT CHECKOUT] erro:', e?.message || e);
    return res.status(500).json({ error: 'Falha ao iniciar checkout do WebChat' });
  }
});

/**
 * GET /api/webchat/quota
 * Retorna o saldo do WebChat do usuário logado
 */
router.get('/webchat/quota', async (req: Request, res: Response) => {
  try {
    const u = (req as any).user;
    if (!u?.username) return res.status(401).json({ error: 'Unauthorized' });

    const q = await WebchatQuota.findOne(
      { username: u.username },
      { totalConversations: 1, usedCharacters: 1, periodStart: 1, periodEnd: 1 }
    ).lean();

    if (!q) return res.json({ totalConversations: 0, usedCharacters: 0, periodStart: null, periodEnd: null });
    return res.json(q);
  } catch (e) {
    console.error('[WEBCHAT QUOTA] error:', e);
    return res.status(500).json({ error: 'Falha ao obter quota WebChat' });
  }
});

export default router;
