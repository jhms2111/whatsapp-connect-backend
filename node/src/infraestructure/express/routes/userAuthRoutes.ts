// src/infraestructure/express/routes/authRoutes.ts
import { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';                  // ✅ bcryptjs para evitar build nativo
import jwt from 'jsonwebtoken';
import User from '../../mongo/models/userModel'; // ajuste o caminho conforme sua estrutura

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

export function setupAuthRoutes(app: Express) {
  app.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      }

      const doc = await User.findOne({ username }).exec();
      if (!doc) return res.status(401).json({ error: 'Credenciais inválidas' });

      const ok = await bcrypt.compare(password, doc.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

      // use doc.id (string virtual) para evitar o erro do _id unknown
      const token = jwt.sign(
        { id: doc.id, username: doc.username, role: doc.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      return res.json({ token });
    } catch (err) {
      console.error('[LOGIN] Erro:', err);
      return res.status(500).json({ error: 'Erro interno ao fazer login' });
    }
  });
}
