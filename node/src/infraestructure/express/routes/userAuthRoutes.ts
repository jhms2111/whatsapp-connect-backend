// src/infraestructure/express/routes/authRoutes.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../mongo/models/userModel';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });

    const user = await User.findOne({ username }).exec();
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas.' });

    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Tu correo aún no está verificado. Revisa tu bandeja de entrada.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    return res.json({ token });
  } catch (err) {
    console.error('[LOGIN] Error:', err);
    return res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
});

export default router;
