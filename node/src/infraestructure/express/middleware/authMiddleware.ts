import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

type JwtPayload = {
  username?: string; // ajuste aqui se seu token usa outro campo (ex.: email)
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

    // Para evitar depender do shape inteiro do token nas rotas
    (req as any).user = { username: decoded.username };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}
