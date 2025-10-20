// src/infraestructure/express/middleware/requireActiveUser.ts
import { Request, Response, NextFunction } from 'express';
import Cliente from '../../mongo/models/clienteModel';

/** Normaliza o caminho para matching consistente, mesmo quando montado em /api */
function getNormalizedPath(req: Request): string {
  // baseUrl: prefixo do app.use('/api', router)  | path: rota interna do router
  // Ex.: baseUrl="/api", path="/verify-email"  => "/api/verify-email"
  const base = req.baseUrl || '';
  const path = req.path || '';
  return `${base}${path}`;
}

/**
 * Rotas públicas que NÃO devem exigir token nem checagem de "conta ativa".
 * Incluímos padrões com e sem o prefixo /api, e aceitamos trailing slashes.
 */
const SKIP_PATHS: RegExp[] = [
  // Auth pública
  /^\/auth(\/|$)/i,
  /^\/login(\/|$)/i,
  /^\/register(\/|$)/i,
  /^\/api\/auth(\/|$)/i,
  /^\/api\/login(\/|$)/i,
  /^\/api\/register(\/|$)/i,

  // Verificação de e-mail (POST do FE e GET direto)
  /^\/verify-email(\/|$)/i,
  /^\/resend-email-verification(\/|$)/i,
  /^\/api\/verify-email(\/|$)/i,
  /^\/api\/resend-email-verification(\/|$)/i,

  // Status (precisa responder mesmo bloqueado)
  /^\/me\/status(\/|$)/i,
  /^\/api\/me\/status(\/|$)/i,

  // Webhooks
  /^\/billing\/webhook(\/|$)/i,
  /^\/billing\/package-webhook(\/|$)/i,
  /^\/whatsapp\/webhook(\/|$)/i,
  /^\/api\/billing\/webhook(\/|$)/i,
  /^\/api\/billing\/package-webhook(\/|$)/i,
  /^\/api\/whatsapp\/webhook(\/|$)/i,

  // Health/checks públicos
  /^\/check-session(\/|$)/i,

  // Socket.io e preflight
  /^\/socket\.io(\/|$)/i,
];

/** Helper para o setupRoutes: decide se deve pular auth/active */
export function shouldSkipActiveCheck(req: Request): boolean {
  if (req.method === 'OPTIONS') return true; // preflight CORS
  const p = getNormalizedPath(req);
  return SKIP_PATHS.some((rx) => rx.test(p));
}

/**
 * Middleware que bloqueia usuários com status "blocked" em endpoints protegidos.
 * Requer que authenticateJWT (ou algo que preencha req.user) já tenha rodado.
 * Admins (role === 'admin') e impersonate (imp === true) SEMPRE passam.
 */
export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (shouldSkipActiveCheck(req)) return next();

    const u = (req as any).user as { username: string; role?: string; imp?: boolean } | undefined;
    if (!u?.username) {
      return res.status(401).json({ error: 'Auth ausente' });
    }

    // Admin e impersonation não bloqueiam
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
