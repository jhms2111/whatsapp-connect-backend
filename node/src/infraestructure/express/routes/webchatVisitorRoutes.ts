import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';
import { normalizeE164 } from '../helpers/phone';
import { sendSmsE164 } from '../helpers/sms';
import { signVisitorJWT, authenticateVisitorJWT } from '../middleware/authVisitor';

// Rate-limit simples por IP e rota (anti-spam)
const lastHit = new Map<string, number>();
function rateLimitMs(ms: number) {
  return (req: Request, res: Response, next: Function) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const last = lastHit.get(key) || 0;
    if (now - last < ms) {
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }
    lastHit.set(key, now);
    next();
  };
}

const router = Router();

/**
 * POST /api/webchat/visitor/request-code
 * Body: { username: string, phone: string(+E164) }
 * Gera/atualiza o visitante, cria roomId fixo e envia OTP por SMS.
 */
router.post('/webchat/visitor/request-code', rateLimitMs(5000), async (req: Request, res: Response) => {
  try {
    const { username, phone } = (req.body || {}) as { username?: string; phone?: string };
    const owner = String(username || '').trim();
    const phoneE164 = normalizeE164(String(phone || ''));

    if (!owner) return res.status(400).json({ error: 'username obrigatório' });
    if (!phoneE164) return res.status(400).json({ error: 'Telefone inválido (use +E164)' });

    // Gera OTP e período de expiração
    const code = ('' + Math.floor(100000 + Math.random() * 900000)).slice(-6);
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    // Sala fixa por (owner, phone)
    const roomId = `webchat:${owner}:${phoneE164}`;
    const sessionId = crypto.createHash('sha1').update(roomId).digest('hex');

    // Upsert do visitante
    await WebchatVisitor.findOneAndUpdate<IWebchatVisitor>(
      { owner, phoneE164 },
      {
        $set: {
          owner,
          phoneE164,
          roomId,
          sessionId,
          otpCode: code,
          otpExpiresAt: expires,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          visitorTokenVersion: 1,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).exec();

    // Envia SMS
    await sendSmsE164(phoneE164, `Seu código de verificação: ${code}`);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[webchat visitor][request-code] error', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/webchat/visitor/verify-code
 * Body: { username: string, phone: string(+E164), code: string[4-6] }
 * Valida o OTP, “verifica” o visitante e retorna visitorToken + room/session.
 */
router.post('/webchat/visitor/verify-code', async (req: Request, res: Response) => {
  try {
    const { username, phone, code } = (req.body || {}) as {
      username?: string;
      phone?: string;
      code?: string | number;
    };
    const owner = String(username || '').trim();
    const phoneE164 = normalizeE164(String(phone || ''));

    if (!owner) return res.status(400).json({ error: 'username obrigatório' });
    if (!phoneE164) return res.status(400).json({ error: 'Telefone inválido' });
    if (!/^\d{4,6}$/.test(String(code || ''))) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Busca documento único (NÃO array)
    const v = await WebchatVisitor.findOne<IWebchatVisitor>({ owner, phoneE164 }).exec();
    if (!v) return res.status(404).json({ error: 'Solicite o código primeiro' });

    if (!v.otpCode || !v.otpExpiresAt || new Date(v.otpExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código expirado. Solicite novamente.' });
    }
    if (v.otpCode !== String(code)) {
      return res.status(400).json({ error: 'Código incorreto' });
    }

    v.verifiedAt = new Date();
    v.otpCode = null;
    v.otpExpiresAt = null;
    v.updatedAt = new Date();
    await v.save();

    const token = signVisitorJWT({ sub: phoneE164, owner, v: v.visitorTokenVersion });

    // Aqui v é DOCUMENTO (com propriedades roomId/sessionId)
    return res.json({
      visitorToken: token,
      roomId: v.roomId,
      sessionId: v.sessionId,
    });
  } catch (e) {
    console.error('[webchat visitor][verify-code] error', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * GET /api/webchat/visitor/status
 * Headers: Authorization: Bearer <visitorToken>
 * Retorna roomId/sessionId da sessão do visitante autenticado por visitorToken.
 */
router.get('/webchat/visitor/status', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as { owner: string; sub: string; v: number };
    // lean tipado para objeto simples
    const v = await WebchatVisitor.findOne({ owner: payload.owner, phoneE164: payload.sub })
      .lean<IWebchatVisitor>()
      .exec();

    if (!v) return res.status(404).json({ error: 'Sessão não encontrada' });

    return res.json({
      ok: true,
      roomId: v.roomId,
      sessionId: v.sessionId,
    });
  } catch (e) {
    console.error('[webchat visitor][status] error', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * POST /api/webchat/visitor/logout
 * Headers: Authorization: Bearer <visitorToken>
 * Invalida o token atual incrementando visitorTokenVersion (derruba TODOS os dispositivos).
 */
router.post('/webchat/visitor/logout', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as { owner: string; sub: string; v: number };
    const v = await WebchatVisitor.findOne({ owner: payload.owner, phoneE164: payload.sub }).exec();

    if (!v) return res.status(404).json({ error: 'Sessão não encontrada' });

    v.visitorTokenVersion = (v.visitorTokenVersion || 1) + 1;
    v.otpCode = null;
    v.otpExpiresAt = null;
    v.updatedAt = new Date();
    await v.save();

    // Opcional: se você usa Socket.io e guarda io no app, emita um broadcast para a sala:
    try {
      const io = (req.app as any).get?.('io');
      if (io) io.to(v.roomId).emit('webchat:visitor:logout', { roomId: v.roomId });
    } catch {}

    return res.json({ ok: true });
  } catch (e) {
    console.error('[webchat visitor][logout] error', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
