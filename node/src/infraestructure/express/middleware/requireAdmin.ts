// src/infraestructure/express/middleware/requireAdmin.ts
import { Request, Response, NextFunction } from 'express';
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas admin' });
  }
  next();
}
