import { Express, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

/**
 * Monta estáticos:
 *  - /uploads -> arquivos enviados (imagens, pdfs etc.) com CORS liberado
 *  - /        -> client build (SPA) se existir
 * IMPORTANTE:
 *  - Não crie app/server aqui.
 *  - Chame setupStaticRoutes(app) UMA vez no bootstrap principal.
 */
export function setupStaticRoutes(app: Express): void {
  // CORS global (ok em dev 3000→4000)
  app.use(cors());

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const clientBuild = path.resolve(process.cwd(), 'client', 'build');

  // /uploads com CORS explícito e cache
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    },
    express.static(uploadsRoot, {
      index: false,
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );

  // (Opcional) servir SPA se existir neste repo
  if (fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    app.get('/', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }
}
