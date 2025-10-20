// src/infraestructure/express/middleware/requireActiveUser.ts
import { Request, Response, NextFunction } from 'express';
import Cliente from '../../mongo/models/clienteModel';

// ⬇️ lista de caminhos que NÃO passam pelo bloqueio de conta
const SKIP_PATHS: RegExp[] = [
  /^\/api\/auth\b/i,
  /^\/api\/login\b/i,
  /^\/api\/register\b/i,
  /^\/api\/verify/i,
  /^\/api\/me\/status\b/i,
  /^\/api\/whatsapp\/webhook\b/i,
  /^\/api\/billing\/webhook\b/i,
  /^\/socket\.io\b/i,
  /^(?:\/api)?\/request-password-reset\b/i,
  /^(?:\/api)?\/reset-password\b/i,
  /^(?:\/api)?\/me\/follow-up\b/i,
  /^(?:\/api)?\/bots\b/i,
  /^\/api\/qr\b/i,              // ⬅️ adicionado: leitura de QR
];

function matchesSkipList(req: Request): boolean {
  const candidates = [
    req.path || '',
    req.url || '',
    req.originalUrl || '',
    `${req.baseUrl || ''}${req.path || ''}`,
    `${req.baseUrl || ''}${req.url || ''}`,
  ];
  return SKIP_PATHS.some((rx) => candidates.some((c) => rx.test(c)));
}

export function shouldSkipActiveCheck(req: Request): boolean {
  if (req.method === 'OPTIONS') return true;
  return matchesSkipList(req);
}

export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (shouldSkipActiveCheck(req)) return next();
    const u = (req as any).user as { username: string; role?: string; imp?: boolean } | undefined;
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

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
