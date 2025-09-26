// src/infraestructure/express/routes/passwordRoutes.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../../mongo/models/userModel';
import { sendEmail } from '../../../utils/email';

const router = Router();

function in24h() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
function buildResetUrl(token: string) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${base}/reset-password?token=${token}`;
}

/** Solicitar recuperação */
router.post('/request-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

    const user = await User.findOne({ email });
    // Resposta genérica para não revelar existência do e-mail
    if (!user) return res.json({ message: 'Se o email existir, enviaremos instruções de recuperação.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = in24h();
    await user.save();

    const resetUrl = buildResetUrl(resetToken);

    await sendEmail({
      to: email,
      subject: 'Recuperação de senha',
      text: `Para redefinir sua senha, acesse: ${resetUrl}`,
      html: `<p>Olá ${user.username},</p>
             <p>Você solicitou a redefinição de senha. Clique no link abaixo (válido por 24h):</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>Se não foi você, ignore este e-mail.</p>`,
    });

    res.json({ message: 'Se o email existir, enviaremos instruções de recuperação.' });
  } catch (err) {
    console.error('[REQUEST PASSWORD RESET] erro:', err);
    res.status(500).json({ error: 'Erro ao solicitar recuperação' });
  }
});

/** Redefinir senha (só com token) */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body as {
      token?: string; password?: string; confirmPassword?: string;
    };

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'As senhas não coincidem' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
    }

    const user = await User.findOne({ resetPasswordToken: token });
    if (!user) return res.status(400).json({ error: 'Token inválido' });

    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
      return res.status(400).json({ error: 'Token expirado' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.json({ message: 'Senha redefinida com sucesso! Você já pode entrar na sua conta.' });
  } catch (err) {
    console.error('[RESET PASSWORD] erro:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

export default router;
