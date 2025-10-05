// src/infraestructure/express/routes/checkoutPackageRoutes.ts
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { authenticateJWT } from '../middleware/authMiddleware';
import { PACKAGES } from '../../../utils/packages';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY não configurada');
}
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL não configurada');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });
const router = Router();

const CHARS_PER_CONVERSATION = 500;

// POST /api/billing/checkout-package
router.post('/billing/checkout-package', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { packageType } = req.body as { packageType?: number };
    const username = (req as any).user?.username as string | undefined;

    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });
    if (!packageType) return res.status(400).json({ error: 'packageType obrigatório' });

    const pacote = PACKAGES[packageType as keyof typeof PACKAGES];
    if (!pacote?.priceId) return res.status(400).json({ error: 'Pacote inválido' });

    const metadata = {
      username: String(username),
      packageType: String(packageType), // "29" | "59" | "99"
    };

    const session = await stripe.checkout.sessions.create({
      // Se você NÃO quer recorrência, mude para 'payment' e use prices one-time.
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: pacote.priceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      client_reference_id: username,
      success_url: `${process.env.FRONTEND_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/erro`,
    });

    return res.json({ url: session.url, id: session.id });
  } catch (err: any) {
    console.error('[BILLING] checkout-package error:', err);
    return res.status(500).json({ error: 'Erro ao criar sessão de pagamento' });
  }
});

// (Opcional) GET /api/billing/checkout-status – útil para o front mostrar saldo atualizado
router.get('/billing/checkout-status', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = (req as any).user?.username as string;
    const q = await ConversationQuota.findOne({ username }).lean();

    const usedCharacters = q?.usedCharacters ?? 0;
    const totalConversations = q?.totalConversations ?? 0;
    const usedConversations = Math.ceil(usedCharacters / CHARS_PER_CONVERSATION);
    const remainingConversations = Math.max(totalConversations - usedConversations, 0);

    return res.json({
      username,
      totalConversations,
      usedConversations,
      remainingConversations,
      usedCharacters,
      packageType: q?.packageType ?? null,
    });
  } catch (err) {
    console.error('[BILLING] checkout-status error:', err);
    return res.status(500).json({ error: 'Erro ao carregar status do pacote' });
  }
});

export default router;
