import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';

const VISITOR_SECRET: Secret =
  (process.env.WEBCHAT_VISITOR_JWT_SECRET as Secret) || ('dev_visitor_secret' as Secret);

export type VisitorJwtPayload = {
  sub: string;   // e-mail do visitante
  owner: string; // username do dono do bot
  v: number;     // versão do token (para invalidar tokens antigos)
  iat?: number;
  exp?: number;
};

/**
 * Assina o JWT do visitante.
 */
export function signVisitorJWT(
  payload: Omit<VisitorJwtPayload, 'iat' | 'exp'>,
  expiresIn: string | number = '90d'
): string {
  const opts: SignOptions = {};
  (opts as any).expiresIn = expiresIn as any;
  return jwt.sign(payload as object, VISITOR_SECRET, opts);
}

/**
 * Autentica o visitante via Authorization: Bearer <visitorToken>.
 * - Decodifica e carrega o visitante do banco.
 * - Confere a versão do token (v) com a do documento.
 */
export async function authenticateVisitorJWT(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Token do visitante ausente.' });
  }

  try {
    const decoded = jwt.verify(token, VISITOR_SECRET) as VisitorJwtPayload;
    const { owner, sub: email, v } = decoded || {};

    if (!owner || !email) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    // Busca o visitante pelo (owner, email)
    const vDoc = await WebchatVisitor.findOne({
      owner,
      email,
    })
      .lean<IWebchatVisitor>()
      .exec();

    if (!vDoc) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }

    // Confere versão do token
    if (
      typeof vDoc.visitorTokenVersion === 'number' &&
      v !== vDoc.visitorTokenVersion
    ) {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }

    (req as any).visitor = decoded;
    return next();
  } catch (err) {
    console.error('[authenticateVisitorJWT] error', err);
    return res.status(401).json({ error: 'Token do visitante inválido.' });
  }
}
