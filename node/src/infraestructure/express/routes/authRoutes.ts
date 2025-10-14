// routes/authRoutes.ts
// routes/authRoutes.ts
import { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../../mongo/models/userModel'; // ajuste o path

const JWT_SECRET = process.env.JWT_SECRET!; // evite fallback em produção

export function setupAuthRoutes(app: Express) {
  app.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username) return res.status(400).json({ error: 'Usuário é obrigatório' });

      // ❗️Busque o usuário para pegar role (e validar senha, se quiser)
      const user = await User.findOne({ username }).lean();
      if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

      // TODO: validar password com bcrypt.compare(password, user.passwordHash)

      const token = jwt.sign(
        {
          sub: String(user._id),   // padrão JWT
          id: String(user._id),    // conveniência p/ seu código atual
          username: user.username,
          role: user.role,         // <- ESSENCIAL p/ adminOnly
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      return res.json({ token });
    } catch (err) {
      console.error('[LOGIN] error:', err);
      return res.status(500).json({ error: 'Erro no login' });
    }
  });
}
