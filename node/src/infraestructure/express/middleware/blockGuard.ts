import { Request, Response, NextFunction } from 'express';
import User from '../../mongo/models/userModel';

/**
 * Bloqueia qualquer requisição de usuário com status "blocked".
 * Aplique este middleware DEPOIS do authenticateJWT e ANTES das rotas de cliente.
 * NÃO aplique em rotas /api/admin/*.
 */
export async function denyIfBlocked(req: Request, res: Response, next: NextFunction) {
  try {
    const u = (req as any).user;
    if (!u?.username) return res.status(401).json({ error: 'Não autenticado' });

    const user = await User.findOne({ username: u.username }, { status: 1, blockedReason: 1 }).lean();
    if (!user) return res.status(401).json({ error: 'Usuário inválido' });

    if (user.status === 'blocked') {
      return res.status(423).json({
        error: 'Conta bloqueada pelo administrador',
        reason: user.blockedReason || 'Sem motivo informado',
      });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao validar status do usuário' });
  }
}
