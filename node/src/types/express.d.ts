// src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string; // Se você tiver mais dados, adicione aqui
      };
    }
  }
}

export {};  // Garante que esse arquivo seja tratado como um módulo
