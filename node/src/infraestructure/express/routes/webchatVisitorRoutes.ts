// routes/webchatVisitorEmail.ts

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';
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
 *
 * NOVO COMPORTAMENTO:
 * - NÃO envia mais código por e-mail.
 * - NÃO exige que "email" seja um e-mail válido (pode ser apenas um nome).
 * - Cria (ou reutiliza) o visitante e a sala fixa (roomId) com base em (owner, email).
 * - Retorna diretamente o visitorToken + roomId + sessionId para o front.
 *
 * Se o mesmo "email" (ou nome) for usado para o mesmo "username",
 * a pessoa entra na mesma sala. Se for um "email"/nome novo, cria-se outra sala.
 *
 * O campo continua se chamando "email" no backend para manter a compatibilidade.
 */
router.post(
  '/webchat/visitor/request-code',
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

      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Informe um nome ou e-mail para iniciar o chat.' });
      }

      // Sala fixa por (owner, email)
      const roomId = `webchat:${owner}:${normalizedEmail}`;
      const sessionId = crypto.createHash('sha1').update(roomId).digest('hex');

      // Upsert do visitante (sem OTP)
      const visitor = await WebchatVisitor.findOneAndUpdate<IWebchatVisitor>(
        { owner, email: normalizedEmail },
        {
          $set: {
            owner,
            email: normalizedEmail,
            roomId,
            sessionId,
            updatedAt: new Date(),
            verifiedAt: new Date(),
          },
          $setOnInsert: {
            visitorTokenVersion: 1,
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true }
      ).exec();

      const token = signVisitorJWT({
        sub: normalizedEmail,
        owner,
        v: visitor.visitorTokenVersion || 1,
      });

      return res.json({
        ok: true,
        visitorToken: token,
        roomId,
        sessionId,
      });
    } catch (e) {
      console.error('[webchat visitor][request-code] error', e);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
);

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
  '/webchat/visitor/status',
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
  '/webchat/visitor/logout',
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
