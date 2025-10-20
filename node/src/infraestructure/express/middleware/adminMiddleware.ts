// src/infraestructure/express/middleware/adminMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

export type Decoded = {
  username: string;
  role?: string;
  imp?: boolean;         // token de impersonate (gerado por admin; "dentro da conta do user")
  actAsAdmin?: boolean;  // opcional: marcar explicitamente como admin
};

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.split(' ')[1] : undefined;
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Decoded;

    // Admin "real" OU token especial de impersonate (imp === true) OU actAsAdmin.
    const isAdmin =
      decoded.role === 'admin' ||
      decoded.imp === true ||
      decoded.actAsAdmin === true;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso negado: apenas admins' });
    }

    (req as any).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ✅ Export default
export default adminOnly;
