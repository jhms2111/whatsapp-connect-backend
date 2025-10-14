// src/types/express.d.ts
declare global {
  namespace Express {
    type Role = 'admin' | 'user';

    interface AuthUser {
      username: string;       // obrigatório após o auth
      role?: Role | string;   // pode vir do token ou do DB
      id?: string;            // sub/id/etc
    }

    interface Request {
      user?: AuthUser;        // <- pronto: req.user tipado
    }
  }
}

export {};
