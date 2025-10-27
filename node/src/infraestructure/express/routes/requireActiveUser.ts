// src/infraestructure/express/middleware/requireActiveUser.ts
import { Request, Response, NextFunction } from 'express';
import Cliente from '../../mongo/models/clienteModel';

function norm(req: Request): string {
  // originalUrl pega o caminho completo depois do host (inclui base + path)
  // removemos querystring para evitar falsos negativos
  const p = (req.originalUrl || req.url || '').split('?')[0];
  return p;
}

/**
 * IMPORTANTE: Qualquer rota que deva ser pública (sem token) precisa estar aqui.
 * Inclui webhooks, health, socket.io, e o webchat público.
 */
const SKIP_PATHS: RegExp[] = [
  // Auth pública / registro / status
  /^\/auth(\/|$)/i,
  /^\/login(\/|$)/i,
  /^\/register(\/|$)/i,
  /^\/api\/auth(\/|$)/i,
  /^\/api\/login(\/|$)/i,
  /^\/api\/register(\/|$)/i,
  /^\/me\/status(\/|$)/i,
  /^\/api\/me\/status(\/|$)/i,

  // Webhooks (anteriores)
  /^\/billing\/webhook(\/|$)/i,
  /^\/billing\/package-webhook(\/|$)/i,
  /^\/whatsapp\/webhook(\/|$)/i,
  /^\/api\/billing\/webhook(\/|$)/i,
  /^\/api\/billing\/package-webhook(\/|$)/i,
  /^\/api\/whatsapp\/webhook(\/|$)/i,

  // Health/check
  /^\/check-session(\/|$)/i,

  // Socket.io e preflight
  /^\/socket\.io(\/|$)/i,

  // >>> WEBCHAT PÚBLICO <<<
  /^\/api\/webchat(\/|$)/i,     // /api/webchat/start e /api/webchat/send
];

export function shouldSkipActiveCheck(req: Request): boolean {
  if (req.method === 'OPTIONS') return true;
  const p = norm(req);
  return SKIP_PATHS.some((rx) => rx.test(p));
}

export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (shouldSkipActiveCheck(req)) return next();

    const u = (req as any).user as { username: string; role?: string; imp?: boolean } | undefined;
    if (!u?.username) {
      return res.status(401).json({ error: 'Auth ausente' });
    }

    if (u.role === 'admin' || u.imp) return next();

    const cli = await Cliente.findOne(
      { username: u.username },
      { status: 1, blockedAt: 1, blockedReason: 1 }
    ).lean();

    if (!cli) return res.status(404).json({ error: 'Usuário não encontrado' });
    if ((cli as any).status === 'blocked') {
      return res.status(423).json({
        error: 'Sua conta está bloqueada',
        status: 'blocked',
        blockedAt: (cli as any).blockedAt || null,
        blockedReason: (cli as any).blockedReason || null,
      });
    }

    return next();
  } catch (e) {
    console.error('[requireActiveUser] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
