// routes/authRoutes.ts
import { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../../mongo/models/userModel'; // ajuste o path conforme seu projeto

const JWT_SECRET = process.env.JWT_SECRET!; // não use fallback em produção

export function setupAuthRoutes(app: Express) {
  // ⚠️ Mantive o prefixo /api para casar com o front (fetch em /api/login)
  app.post('/api/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Usuário é obrigatório' });
      }

      // Busque o usuário (e valide a senha se houver hash salvo)
      const user = await User.findOne({ username }).lean();
      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // TODO: validar senha real, ex:
      // const ok = await bcrypt.compare(password, user.passwordHash);
      // if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

      // Gere o token com as claims usadas pelo adminMiddleware (role)
      const token = jwt.sign(
        {
          sub: String(user._id),
          id: String(user._id),
          username: user.username,
          role: user.role,            // ESSENCIAL p/ adminOnly
          // opcional: actAsAdmin: user.actAsAdmin === true
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // 💡 Devolvemos também role e username para o front salvar jwt_admin quando admin
      return res.json({
        token,
        role: user.role || 'user',
        username: user.username,
      });
    } catch (err) {
      console.error('[LOGIN] error:', err);
      return res.status(500).json({ error: 'Erro no login' });
    }
  });
}
