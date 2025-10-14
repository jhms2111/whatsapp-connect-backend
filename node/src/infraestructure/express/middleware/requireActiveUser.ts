// src/infraestructure/express/middleware/requireActiveUser.ts
import { Request, Response, NextFunction } from 'express';
import User from '../../mongo/models/userModel';

// Padrões que NÃO exigem conta ativa (login, registro, webhooks, socket, status)
const SKIP_PATTERNS = [
  /^\/api\/auth\b/i,
  /^\/api\/login\b/i,
  /^\/api\/register\b/i,
  /^\/api\/user\/login\b/i,
  /^\/api\/me\/status\b/i,
  /^\/api\/billing\/webhook\b/i,
  /^\/socket\.io\b/i,
];

export function shouldSkipActiveCheck(req: Request) {
  if (req.method === 'OPTIONS') return true;
  const url = (req.originalUrl || req.url || '').toLowerCase();
  return SKIP_PATTERNS.some((rx) => rx.test(url));
}

export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (shouldSkipActiveCheck(req)) return next();

    const u = (req as any).user as { username: string; role?: string; imp?: boolean } | undefined;
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    // Admin e impersonation não bloqueiam
    if (u.role === 'admin' || u.imp) return next();

    const usr = await User.findOne(
      { username: u.username },
      { status: 1, blockedAt: 1, blockedReason: 1 }
    ).lean();

    if (!usr) return res.status(404).json({ error: 'Usuário não encontrado' });

    if ((usr as any).status === 'blocked') {
      return res.status(423).json({
        error: 'Sua conta está bloqueada',
        status: 'blocked',
        blockedAt: (usr as any).blockedAt || null,
        blockedReason: (usr as any).blockedReason || null,
      });
    }

    return next();
  } catch (e) {
    console.error('[requireActiveUser] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
