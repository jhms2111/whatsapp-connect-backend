// src/infraestructure/express/routes/registerRoutes.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../../mongo/models/userModel';
import { sendEmail } from '../../../utils/email';

const router = Router();

/** Utils */
function in24h() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
function buildFrontendVerifyUrl(emailToken: string, email: string) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  const e = encodeURIComponent(email);
  return `${base}/verify-email?token=${emailToken}&email=${e}`;
}
function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Template de correo ENKI (ES) — único botón */
function enkiEmailTemplate({
  username,
  confirmUrl,
}: {
  username: string;
  confirmUrl: string;
}) {
  const azul = '#1EAEDB';
  const verde = '#2ECC71';
  return `
  <!doctype html>
  <html lang="es">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Confirma tu cuenta - ENKI</title>
      <style>
        a { text-decoration: none; }
        @media (max-width: 600px) {
          .card { padding: 20px !important; }
          .cta { display:block !important; margin-bottom: 10px !important; }
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background:#F5FFFB; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5FFFB; padding:24px 0;">
        <tr>
          <td align="center">
            <!-- Marca ENKI con “halo” -->
            <div style="position:relative; margin-bottom:12px;">
              <div style="position:absolute; inset:-24px; border-radius:9999px; background:linear-gradient(90deg, ${azul}33, ${verde}33); filter:blur(24px);"></div>
              <div style="position:relative; height:56px; width:56px; border-radius:16px; background:linear-gradient(135deg, ${azul}, ${verde}); box-shadow:0 10px 30px rgba(0,0,0,0.08); display:grid; place-items:center;">
                <span style="color:#fff; font-weight:700; font-size:20px; letter-spacing:1px;">E</span>
              </div>
            </div>
            <h1 style="margin:0 0 8px; font-size:24px; font-weight:800; background:linear-gradient(90deg, ${azul}, ${verde}); -webkit-background-clip:text; background-clip:text; color:transparent;">ENKI</h1>
          </td>
        </tr>
        <tr>
          <td align="center">
            <table class="card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffffE6; backdrop-filter:blur(6px); border:1px solid #F0F2F5; border-radius:16px; padding:28px; box-shadow:0 10px 30px rgba(17,24,39,0.06);">
              <tr>
                <td>
                  <h2 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">Hola${username ? `, ${escapeHtml(username)}` : ''} 👋</h2>
                  <p style="margin:0 0 10px; font-size:15px; line-height:1.6; color:#374151;">
                    ¡Gracias por unirte a <strong>ENKI</strong>! Nos alegra darte la bienvenida.  
                    Para activar tu cuenta, confirma tu correo electrónico. El enlace es válido por <strong>24 horas</strong>.
                  </p>
                  <div style="text-align:center; margin:18px 0;">
                    <a class="cta" href="${confirmUrl}" style="display:inline-block; padding:12px 18px; border-radius:12px; font-weight:700; color:#fff; background:linear-gradient(90deg, ${azul}, ${verde}); box-shadow:0 6px 18px rgba(46,204,113,0.25);">
                      Confirmar cuenta
                    </a>
                  </div>
                  <p style="margin:12px 0 0; font-size:13px; line-height:1.6; color:#6B7280;">
                    Si el botón no funciona, copia y pega este enlace en tu navegador: <br/>
                    <a href="${confirmUrl}" style="color:${azul}; word-break:break-all;">${confirmUrl}</a>
                  </p>
                  <hr style="border:none; border-top:1px solid #F0F2F5; margin:18px 0;" />
                  <p style="margin:0; font-size:13px; line-height:1.6; color:#6B7280;">
                    Si no solicitaste esta cuenta, puedes ignorar este correo con tranquilidad.  
                    Nuestro equipo está aquí para ayudarte cuando lo necesites.
                  </p>
                  <p style="margin:16px 0 0; font-size:12px; color:#9CA3AF; text-align:center;">
                    © ${new Date().getFullYear()} ENKI — Seguridad y confianza.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, confirmPassword } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    };

    // Validaciones básicas
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Usuario, correo, contraseña y confirmación son obligatorios.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    // Buscamos por email y por usuario de forma separada
    const existingByEmail = await User.findOne({ email });
    const existingByUsername = await User.findOne({ username });

    // Si el correo ya existe pero NO está verificado → reenviar verificación
    if (existingByEmail && !existingByEmail.emailVerified) {
      existingByEmail.emailToken = crypto.randomBytes(20).toString('hex');
      existingByEmail.emailTokenExpiry = in24h();
      await existingByEmail.save();

      const confirmUrl = buildFrontendVerifyUrl(existingByEmail.emailToken, email);
      await sendEmail({
        to: email,
        subject: 'Confirma tu cuenta en ENKI',
        text:
          `Hola${existingByEmail.username ? `, ${existingByEmail.username}` : ''}!\n\n` +
          `Notamos que tu cuenta aún no está verificada. Te enviamos un nuevo enlace (válido por 24h):\n` +
          `${confirmUrl}\n\n` +
          `Si el botón no funciona, copia y pega el enlace en tu navegador.\n\n` +
          `— ENKI · Seguridad y confianza`,
        html: enkiEmailTemplate({
          username: existingByEmail.username || '',
          confirmUrl,
        }),
      });

      // 200 OK para que el frontend muestre la pantalla de “revisa tu correo”
      return res.status(200).json({
        message: 'Tu correo ya estaba registrado pero aún no verificado. Te enviamos un nuevo enlace de confirmación.',
        code: 'VERIFICATION_EMAIL_RESENT',
      });
    }

    // Si el correo ya existe y está verificado → 409
    if (existingByEmail && existingByEmail.emailVerified) {
      return res.status(409).json({
        error: 'Este correo ya está registrado y verificado. Inicia sesión o recupera tu contraseña.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    // Si el usuario (username) ya existe → 409
    if (existingByUsername) {
      return res.status(409).json({
        error: 'Este nombre de usuario ya está en uso. Elige otro.',
        code: 'USERNAME_TAKEN',
      });
    }

    // Crear nueva cuenta
    const passwordHash = await bcrypt.hash(password, 10);
    const emailToken = crypto.randomBytes(20).toString('hex');
    const tokenExpiry = in24h();

    const user = new User({
      username,
      email,
      passwordHash,
      role: 'user',
      emailVerified: false,
      emailToken,
      emailTokenExpiry: tokenExpiry,
    });

    await user.save();

    // Enviar correo de verificación
    const confirmUrl = buildFrontendVerifyUrl(emailToken, email);
    await sendEmail({
      to: email,
      subject: 'Confirma tu cuenta en ENKI',
      text:
        `Hola${username ? `, ${username}` : ''}!\n\n` +
        `Gracias por unirte a ENKI. Para activar tu cuenta, confirma tu correo (enlace válido por 24h):\n` +
        `${confirmUrl}\n\n` +
        `Si el botón no funciona, copia y pega el enlace en tu navegador.\n\n` +
        `— ENKI · Seguridad y confianza`,
      html: enkiEmailTemplate({
        username: username || '',
        confirmUrl,
      }),
    });

    return res.status(201).json({ message: 'Cuenta creada. Revisa tu correo para activarla.' });
  } catch (error) {
    console.error('[REGISTER] error:', error);
    return res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

export default router;
