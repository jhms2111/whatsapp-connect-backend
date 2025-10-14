import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

type JwtPayload = {
  sub?: string;
  id?: string;
  username?: string;
  role?: 'admin' | 'user';
  imp?: boolean; // 👈 token de impersonation
  [k: string]: any;
};

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded?.username) {
      return res.status(400).json({ error: 'Token sem username' });
    }

    (req as any).user = {
      id: decoded.sub || decoded.id,
      username: decoded.username,
      role: decoded.role || 'user',
      imp: !!decoded.imp, // 👈
    };

    next();
  } catch {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}
