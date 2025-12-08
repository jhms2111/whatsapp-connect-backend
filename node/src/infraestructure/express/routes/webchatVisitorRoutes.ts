// routes/webchatVisitorEmail.ts

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';
import { sendEmail } from '../../../utils/email';
import { signVisitorJWT, authenticateVisitorJWT } from '../middleware/authVisitor';

const router = Router();

/**
 * Rate-limit simples por IP e rota (anti-spam).
 */
const lastHit = new Map<string, number>();

function rateLimitMs(ms: number) {
  return (req: Request, res: Response, next: Function) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const last = lastHit.get(key) || 0;

    if (now - last < ms) {
      return res
        .status(429)
        .json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }

    lastHit.set(key, now);
    next();
  };
}

/**
 * POST /api/webchat/visitor/request-code
 * Body: { username: string, email: string }
 * Gera/atualiza o visitante, cria roomId fixo e envia OTP por e-mail.
 */
router.post(
  '/visitor/request-code',
  rateLimitMs(5000),
  async (req: Request, res: Response) => {
    try {
      const { username, email } = (req.body || {}) as {
        username?: string;
        email?: string;
      };

      const owner = String(username || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();

      if (!owner) {
        return res.status(400).json({ error: 'username obrigatório' });
      }

      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }

      // Gera OTP e período de expiração
      const code = ('' + Math.floor(100000 + Math.random() * 900000)).slice(-6);
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

      // Sala fixa por (owner, email)
      const roomId = `webchat:${owner}:${normalizedEmail}`;
      const sessionId = crypto.createHash('sha1').update(roomId).digest('hex');

      // Upsert do visitante
      await WebchatVisitor.findOneAndUpdate<IWebchatVisitor>(
        { owner, email: normalizedEmail },
        {
          $set: {
            owner,
            email: normalizedEmail,
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

      // Envia e-mail com o código
      await sendEmail({
        to: normalizedEmail,
        subject: 'Seu código para entrar no chat ENKI',
        text: `Seu código de verificação para entrar no chat ENKI é: ${code}. Ele é válido por 5 minutos.`,
        html: `<p>Olá,</p>
               <p>Seu código de verificação para entrar no chat <b>ENKI</b> é:</p>
               <p style="font-size: 20px; font-weight: bold; letter-spacing: 4px;">${code}</p>
               <p>Ele é válido por 5 minutos. Se você não solicitou este código, ignore este e-mail.</p>`,
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error('[webchat visitor][request-code] error', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

/**
 * POST /api/webchat/visitor/verify-code
 * Body: { username: string, email: string, code: string[4-6] }
 * Valida o OTP, “verifica” o visitante e retorna visitorToken + room/session.
 */
router.post('/visitor/verify-code', async (req: Request, res: Response) => {
  try {
    const { username, email, code } = (req.body || {}) as {
      username?: string;
      email?: string;
      code?: string | number;
    };

    const owner = String(username || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!owner) {
      return res.status(400).json({ error: 'username obrigatório' });
    }

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    if (!/^\d{4,6}$/.test(String(code || ''))) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Busca documento único
    const v = await WebchatVisitor.findOne<IWebchatVisitor>({
      owner,
      email: normalizedEmail,
    }).exec();

    if (!v) {
      return res.status(404).json({ error: 'Solicite o código primeiro' });
    }

    if (
      !v.otpCode ||
      !v.otpExpiresAt ||
      new Date(v.otpExpiresAt).getTime() < Date.now()
    ) {
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

    const token = signVisitorJWT({
      sub: normalizedEmail,
      owner,
      v: v.visitorTokenVersion,
    });

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
 * POST /api/webchat/start
 * Headers: Authorization: Bearer <visitorToken>
 * Inicia / recupera a sessão de chat do visitante autenticado.
 *
 * Aqui NÃO damos mais 404 se não achar no banco;
 * usamos apenas o JWT para montar roomId/sessionId.
 */
router.post('/start', authenticateVisitorJWT, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).visitor as { owner: string; sub: string; v: number };
    const owner = payload.owner;
    const email = payload.sub;

    // Reconstrói roomId e sessionId de forma determinística
    const roomId = `webchat:${owner}:${email}`;
    const sessionId = crypto.createHash('sha1').update(roomId).digest('hex');

    // (Opcional) Garante que o visitor exista no banco
    await WebchatVisitor.findOneAndUpdate<IWebchatVisitor>(
      { owner, email },
      {
        $set: {
          owner,
          email,
          roomId,
          sessionId,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          visitorTokenVersion: payload.v || 1,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    ).exec();

    return res.json({
      ok: true,
      roomId,
      sessionId,
    });
  } catch (e) {
    console.error('[webchat][start] error', e);
    return res.status(500).json({ error: 'Erro interno ao iniciar o chat' });
  }
});

/**
 * GET /api/webchat/visitor/status
 * Headers: Authorization: Bearer <visitorToken>
 * Retorna roomId/sessionId da sessão do visitante autenticado por visitorToken.
 */
router.get(
  '/visitor/status',
  authenticateVisitorJWT,
  async (req: Request, res: Response) => {
    try {
      const payload = (req as any).visitor as { owner: string; sub: string; v: number };
      const owner = payload.owner;
      const email = payload.sub;

      // Tenta encontrar no banco
      const v = await WebchatVisitor.findOne({
        owner,
        email,
      })
        .lean<IWebchatVisitor>()
        .exec();

      // Se não achar, reconstrói igual ao /start
      const roomId = v?.roomId || `webchat:${owner}:${email}`;
      const sessionId =
        v?.sessionId || crypto.createHash('sha1').update(roomId).digest('hex');

      return res.json({
        ok: true,
        roomId,
        sessionId,
      });
    } catch (e) {
      console.error('[webchat visitor][status] error', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

/**
 * POST /api/webchat/visitor/logout
 * Headers: Authorization: Bearer <visitorToken>
 * Invalida o token atual incrementando visitorTokenVersion (derruba TODOS os dispositivos).
 */
router.post(
  '/visitor/logout',
  authenticateVisitorJWT,
  async (req: Request, res: Response) => {
    try {
      const payload = (req as any).visitor as { owner: string; sub: string; v: number };

      const v = await WebchatVisitor.findOne({
        owner: payload.owner,
        email: payload.sub,
      }).exec();

      if (!v) {
        return res.status(404).json({ error: 'Sessão não encontrada' });
      }

      v.visitorTokenVersion = (v.visitorTokenVersion || 1) + 1;
      v.otpCode = null;
      v.otpExpiresAt = null;
      v.updatedAt = new Date();
      await v.save();

      try {
        const io = (req.app as any).get?.('io');
        if (io) {
          io.to(v.roomId).emit('webchat:visitor:logout', { roomId: v.roomId });
        }
      } catch {
        // ignora erro de socket
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('[webchat visitor][logout] error', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

export default router;
