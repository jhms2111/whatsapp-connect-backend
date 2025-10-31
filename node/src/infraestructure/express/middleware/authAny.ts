// src/infraestructure/express/middleware/authPanel.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type PanelJwtPayload = {
  username: string;
  iat?: number;
  exp?: number;
};

const PANEL_JWT_SECRET = process.env.PANEL_JWT_SECRET || 'panel-secret-change-me';

export function authenticatePanelJWT(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.substring(7);
  try {
    const payload = jwt.verify(token, PANEL_JWT_SECRET) as PanelJwtPayload;
    if (!payload?.username) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    (req as any).panel = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default authenticatePanelJWT;
