import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import WebchatQuota from '../../mongo/models/webchatQuotaModel';
import { WEBCHAT_PACKAGES, WebchatPackageType } from '../../../utils/webchatPackages';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';

const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;

/** GET /api/webchat/quota (privada) */
router.get('/webchat/quota', async (req: Request, res: Response) => {
  try {
    const u = (req as any).user as { username?: string } | undefined;
    if (!u?.username) return res.status(401).json({ error: 'Não autenticado' });

    const doc = await WebchatQuota.findOne(
      { username: u.username },
      { _id: 0, username: 1, totalConversations: 1, usedCharacters: 1, periodStart: 1, periodEnd: 1, packageType: 1 }
    ).lean();

    if (!doc) {
      return res.json({
        username: u.username,
        totalConversations: 0,
        usedCharacters: 0,
        periodStart: null,
        periodEnd: null,
        packageType: null,
      });
    }

    return res.json(doc);
  } catch (e) {
    console.error('[webchat/quota] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar quota' });
  }
});

/** POST /api/billing/webchat/checkout (privada) */
router.post('/billing/webchat/checkout', async (req: Request, res: Response) => {
  try {
    const u = (req as any).user as { username?: string } | undefined;
    if (!u?.username) return res.status(401).json({ error: 'Não autenticado' });
    if (!stripe) return res.status(503).json({ error: 'Stripe não configurado (STRIPE_SECRET_KEY ausente)' });

    const { packageType } = req.body as { packageType?: number };
    const key = packageType as WebchatPackageType;
    if (!Number.isInteger(packageType) || !(key in WEBCHAT_PACKAGES)) {
      return res.status(400).json({ error: 'Pacote inexistente (use 19|39|79)' });
    }

    const pkg = WEBCHAT_PACKAGES[key];

    // detecta se price é recorrente
    let priceInfo: Stripe.Price;
    try {
      priceInfo = await stripe.prices.retrieve(pkg.priceId);
    } catch (err: any) {
      const msg = err?.raw?.message || err?.message || String(err);
      return res.status(400).json({ error: `priceId inválido: ${msg}` });
    }

    const isRecurring = !!priceInfo.recurring;
    const mode: 'subscription' | 'payment' = isRecurring ? 'subscription' : 'payment';

    // metadados comuns
    const commonMd = {
      username: u.username,
      channel: 'webchat',
      packageType: String(packageType),
    };

    // Se for recorrente, copie também para subscription_data.metadata
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/sucesso?ch=webchat`,
      cancel_url: `${FRONTEND_URL}/webchat-packages`,
      metadata: commonMd,
      allow_promotion_codes: true,
      ...(isRecurring
        ? {
            subscription_data: {
              metadata: commonMd,
            },
          }
        : {}),
    });

    return res.json({ url: session.url, mode });
  } catch (e: any) {
    const msg = e?.raw?.message || e?.message || String(e);
    console.error('[billing/webchat/checkout] erro:', msg);
    return res.status(500).json({ error: `Falha ao criar checkout do WebChat: ${msg}` });
  }
});

/** (Opcional) compatível com seu antigo endpoint */
router.post('/webchat/checkout-session', async (req: Request, res: Response) => {
  try {
    const u = (req as any).user as { username?: string } | undefined;
    if (!u?.username) return res.status(401).json({ error: 'Não autenticado' });
    if (!stripe) return res.status(503).json({ error: 'Stripe não configurado' });

    const { packageType } = req.body as { packageType?: number };
    const key = packageType as WebchatPackageType;
    if (!Number.isInteger(packageType) || !(key in WEBCHAT_PACKAGES)) {
      return res.status(400).json({ error: 'Pacote inexistente' });
    }
    const pkg = WEBCHAT_PACKAGES[key];

    const priceInfo = await stripe.prices.retrieve(pkg.priceId);
    const isRecurring = !!priceInfo.recurring;
    const mode: 'subscription' | 'payment' = isRecurring ? 'subscription' : 'payment';

    const md = {
      username: u.username,
      channel: 'webchat',
      packageType: String(packageType),
    };

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/sucesso?ch=webchat`,
      cancel_url: `${FRONTEND_URL}/webchat-packages`,
      metadata: md,
      allow_promotion_codes: true,
      ...(isRecurring ? { subscription_data: { metadata: md } } : {}),
    });

    return res.json({ id: session.id, url: session.url, mode });
  } catch (e: any) {
    const msg = e?.raw?.message || e?.message || String(e);
    console.error('[webchat/checkout-session] erro:', msg);
    return res.status(500).json({ error: `Falha ao criar checkout do WebChat: ${msg}` });
  }
});

export default router;
