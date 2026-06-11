//onboarding.routes.ts


import { Router, Request, Response } from 'express';

import { onboardingStartService } from '../services/onboardingStart.service';
import { onboardingVerifyService } from '../services/onboardingVerify.service';

import OnboardingSession from '../../../infraestructure/mongo/models/onboardingDraftModel';

import { sendEmail } from '../../../utils/email';

const router = Router();

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

function onboardingCodeEmailTemplate({
  username,
  code,
}: {
  username: string;
  code: string;
}) {
  return `
  <!doctype html>
  <html lang="pt">
    <body style="margin:0;padding:0;background:#F5FFFB;font-family:Arial,sans-serif;color:#111827;">
      <table width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px;border:1px solid #eee;">
              <tr>
                <td>
                  <h2>Olá${username ? `, ${username}` : ''} 👋</h2>
                  <p>Seu assistente ENKI está quase pronto.</p>
                  <p>Use este código para confirmar seu email e finalizar a criação:</p>
                  <div style="text-align:center;margin:24px 0;">
                    <div style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 24px;border-radius:14px;background:#F3F4F6;color:#111827;">
                      ${code}
                    </div>
                  </div>
                  <p style="font-size:14px;color:#6B7280;">
                    Este código é válido por 15 minutos.
                  </p>
                  <p style="font-size:13px;color:#9CA3AF;">
                    Se você não solicitou esta conta, pode ignorar este email.
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

router.get('/public-chat-profile/:username', async (req: Request, res: Response) => {
  try {
    const username = String(req.params.username || '').trim();

    if (!username) {
      return res.status(400).json({
        error: 'Username é obrigatório.',
      });
    }

    const session = await OnboardingSession.findOne({
      username,
      status: 'completed',
    })
      .sort({
        completedAt: -1,
        createdAt: -1,
      })
      .select('username domain account.businessName createdBotId');

    if (!session) {
      return res.status(404).json({
        error: 'Agente não encontrado.',
      });
    }

    return res.status(200).json({
      username: session.username,
      domain: session.domain || 'restaurant',
      businessName: session.account?.businessName || session.username,
      botId: session.createdBotId || null,
    });
  } catch (error) {
    console.error('[PUBLIC_CHAT_PROFILE]', error);

    return res.status(500).json({
      error: getErrorMessage(error, 'Erro ao carregar perfil público do chat.'),
    });
  }
});

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { username, account } = req.body;

    const email = account?.email || req.body.email;
    const password = account?.password || req.body.password;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Username, email e senha são obrigatórios.',
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        error: 'A senha precisa ter pelo menos 8 caracteres.',
      });
    }

    const result = await onboardingStartService({
      ...req.body,
      email,
      password,
      account: {
        ...account,
        email,
      },
    });

    await sendEmail({
      to: email,
      subject: 'Seu código de confirmação ENKI',
      text: `Seu código ENKI é: ${result.verificationCode}. Ele é válido por 15 minutos.`,
      html: onboardingCodeEmailTemplate({
        username,
        code: result.verificationCode,
      }),
    });

    return res.status(200).json({
      message: 'Código enviado ao email.',
      code: 'EMAIL_CODE_SENT',
    });
  } catch (error) {
    console.error('[ONBOARDING_START]', error);

    return res.status(500).json({
      error: getErrorMessage(error, 'Erro ao iniciar onboarding.'),
    });
  }
});

router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        error: 'Email e código são obrigatórios.',
      });
    }

    const data = await onboardingVerifyService({
      email,
      code,
    });

    return res.status(200).json({
      message: 'Conta verificada e assistente criado.',
      ...data,
    });
  } catch (error) {
    console.error('[ONBOARDING_VERIFY_CODE]', error);

    return res.status(500).json({
      error: getErrorMessage(error, 'Erro ao verificar código.'),
    });
  }
});

export default router;