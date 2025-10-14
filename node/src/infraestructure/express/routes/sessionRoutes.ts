// src/infraestructure/express/routes/sessionRoutes.ts (exemplo)
import { Router } from 'express';

const router = Router();

// simulação de registro em memória de sessões ativas por username
const activeUsers = new Map<string, number>(); // username -> count de sessões

router.get('/check-session', (req, res) => {
  const user = (req as any).user; // vindo do authenticateJWT montado antes
  if (!user?.username) return res.status(401).json({ error: 'Unauthorized' });

  const isImpersonation = Boolean((req as any).user?.imp);       // do JWT
  const forceFlag = req.headers['x-impersonate'] === '1';         // opcional

  const current = activeUsers.get(user.username) || 0;
  if (current > 0 && !isImpersonation && !forceFlag) {
    // regra antiga: já tem sessão e não é impersonação -> 409
    return res.status(409).json({ error: 'Sessão já ativa para este usuário' });
  }

  // ok — pode prosseguir
  return res.json({ ok: true, activeCount: current });
});

export default router;
