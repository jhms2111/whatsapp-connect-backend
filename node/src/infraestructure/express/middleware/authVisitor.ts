import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import WebchatVisitor, { IWebchatVisitor } from '../../mongo/models/WebchatVisitor';

const VISITOR_SECRET: Secret =
  (process.env.WEBCHAT_VISITOR_JWT_SECRET as Secret) || ('dev_visitor_secret' as Secret);

export type VisitorJwtPayload = {
  sub: string;   // phoneE164 do visitante
  owner: string; // username do dono do bot
  v: number;     // versão do token (para invalidar tokens antigos)
  iat?: number;
  exp?: number;
};

/**
 * Assina o JWT do visitante. O cast em expiresIn evita incompatibilidades
 * entre versões de @types/jsonwebtoken (StringValue vs string).
 */
export function signVisitorJWT(
  payload: Omit<VisitorJwtPayload, 'iat' | 'exp'>,
  expiresIn: string | number = '90d'
): string {
  const opts: SignOptions = {};
  // Evita erro TS2322 em libs antigas
  (opts as any).expiresIn = expiresIn as any;
  return jwt.sign(payload as object, VISITOR_SECRET, opts);
}

/**
 * Autentica o visitante via Authorization: Bearer <visitorToken>.
 * - Decodifica e carrega o visitante do banco (tipado).
 * - Confere a versão do token (v) com a do documento.
 */
export async function authenticateVisitorJWT(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token do visitante ausente.' });

  try {
    const decoded = jwt.verify(token, VISITOR_SECRET) as VisitorJwtPayload;
    const { owner, sub: phoneE164, v } = decoded || {};

    if (!owner || !phoneE164) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    // Documento tipado e "lean" para evitar objetos "estranhos"
    const vDoc = await WebchatVisitor.findOne({ owner, phoneE164 })
      .lean<IWebchatVisitor>()
      .exec();

    if (!vDoc) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }

    // Confere versão do token
    if (typeof vDoc.visitorTokenVersion === 'number' && v !== vDoc.visitorTokenVersion) {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }

    (req as any).visitor = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token do visitante inválido.' });
  }
}
