import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { authenticateJWT } from '../middleware/authMiddleware';
import NumberRequest from '../../mongo/models/numberRequestModel';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

router.post('/billing/checkout', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { numberRequestId, priceId } = req.body as { numberRequestId?: string; priceId?: string };
    const username = (req as any).user.username;

    if (!numberRequestId || !priceId) {
      return res.status(400).json({ error: 'numberRequestId e priceId são obrigatórios' });
    }

    const nr = await NumberRequest.findOne({ _id: numberRequestId, username });
    if (!nr) return res.status(404).json({ error: 'Pedido não encontrado' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { numberRequestId: nr.id },
      success_url: `${process.env.FRONTEND_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/erro`,
    });

    if (!nr.checkoutSessionId) {
      nr.checkoutSessionId = session.id;
      await nr.save();
    }

    return res.json({ url: session.url });
  } catch (err) {
    console.error('[BILLING] checkout error:', err);
    return res.status(500).json({ error: 'Erro ao criar sessão de pagamento' });
  }
});

export default router;
