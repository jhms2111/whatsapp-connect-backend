import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../../mongo/models/userModel';
import OnboardingDraft from '../../mongo/models/onboardingDraftModel';
import CatalogCollection from '../../mongo/models/catalogCollectionModel';
import CatalogItem from '../../mongo/models/catalogItemModel';
import Bot from '../../mongo/models/botModel';

import { sendEmail } from '../../../utils/email';

import {
  normalizeOnboardingAnswers,
  getCollectionTitle,
  buildProductDescription,
  buildAbout,
  buildGuidelines,
} from '../../../utils/onboardingNormalizer';

const router = Router();

function in24h() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function codeExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

function generateEmailCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function enkiCodeEmailTemplate({
  username,
  code,
}: {
  username: string;
  code: string;
}) {
  return `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#F5FFFB;font-family:Arial,sans-serif;color:#111827;">
      <table width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px;border:1px solid #eee;">
              <tr>
                <td>
                  <h2>Hola${username ? `, ${escapeHtml(username)}` : ''} 👋</h2>
                  <p>Tu asistente ENKI está casi listo.</p>
                  <p>Usa este código para confirmar tu correo y finalizar la creación:</p>
                  <div style="text-align:center;margin:24px 0;">
                    <div style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 24px;border-radius:14px;background:#F3F4F6;color:#111827;">
                      ${code}
                    </div>
                  </div>
                  <p style="font-size:14px;color:#6B7280;">
                    Este código es válido por 15 minutos.
                  </p>
                  <p style="font-size:13px;color:#9CA3AF;">
                    Si no solicitaste esta cuenta, puedes ignorar este correo.
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

function cleanProducts(products: any[]) {
  if (!Array.isArray(products)) return [];

  return products
    .map((product) => ({
      title: String(product?.title || '').trim(),
      description: String(product?.description || '').trim(),
      price: product?.price ?? '',
      link: String(product?.link || '').trim(),
    }))
    .filter((product) => product.title || product.description);
}

router.post('/onboarding/start', async (req: Request, res: Response) => {
  try {
    const { username, email, password, answers, products, account } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Usuario, email y contraseña son obligatorios.',
      });
    }

    if (!answers || !account) {
      return res.status(400).json({
        error: 'Datos del onboarding incompletos.',
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 8 caracteres.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUsername = String(username).trim();

    const normalizedAnswers = normalizeOnboardingAnswers(answers);
    const normalizedProducts = cleanProducts(products);

    const existingByEmail = await User.findOne({ email: cleanEmail });
    const existingByUsername = await User.findOne({ username: cleanUsername });

    if (existingByEmail && existingByEmail.emailVerified) {
      return res.status(409).json({
        error: 'Este correo ya está registrado. Inicia sesión.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    if (
      existingByUsername &&
      existingByUsername.emailVerified &&
      existingByUsername.email !== cleanEmail
    ) {
      return res.status(409).json({
        error: 'Este nombre de usuario ya está en uso.',
        code: 'USERNAME_TAKEN',
      });
    }

    const code = generateEmailCode();
    const codeHash = await bcrypt.hash(code, 10);

    let user = existingByEmail;

    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);

      user = new User({
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        role: 'user',
        emailVerified: false,
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpiry: codeExpiry(),
        emailVerificationAttempts: 0,
      });
    } else {
      user.username = cleanUsername;
      user.passwordHash = await bcrypt.hash(password, 10);
      user.emailVerificationCodeHash = codeHash;
      user.emailVerificationCodeExpiry = codeExpiry();
      user.emailVerificationAttempts = 0;
    }

    await user.save();

    await OnboardingDraft.findOneAndUpdate(
      { email: cleanEmail },
      {
        username: cleanUsername,
        email: cleanEmail,
        businessType: normalizedAnswers.businessType || '',
        answers,
        normalizedAnswers,
        products: normalizedProducts,
        account: {
          businessName: String(account?.businessName || '').trim(),
          email: cleanEmail,
          phone: String(account?.phone || '').trim(),
        },
        status: 'pending_email',
        expiresAt: in24h(),
      },
      { upsert: true, new: true }
    );

    await sendEmail({
      to: cleanEmail,
      subject: 'Tu código de confirmación ENKI',
      text: `Tu código ENKI es: ${code}. Es válido por 15 minutos.`,
      html: enkiCodeEmailTemplate({
        username: cleanUsername,
        code,
      }),
    });

    return res.status(200).json({
      message: 'Código enviado al email.',
      code: 'EMAIL_CODE_SENT',
    });
  } catch (error) {
    console.error('[ONBOARDING_START] error:', error);
    return res.status(500).json({
      error: 'Error al iniciar onboarding.',
    });
  }
});

router.post('/onboarding/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        error: 'Email y código son obligatorios.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.emailVerificationCodeHash) {
      return res.status(400).json({
        error: 'Código inválido o expirado.',
      });
    }

    if (
      !user.emailVerificationCodeExpiry ||
      user.emailVerificationCodeExpiry.getTime() < Date.now()
    ) {
      return res.status(400).json({
        error: 'Código expirado.',
      });
    }

    if ((user.emailVerificationAttempts || 0) >= 5) {
      return res.status(429).json({
        error: 'Demasiados intentos. Solicita un nuevo código.',
      });
    }

    const validCode = await bcrypt.compare(
      cleanCode,
      user.emailVerificationCodeHash
    );

    if (!validCode) {
      user.emailVerificationAttempts =
        (user.emailVerificationAttempts || 0) + 1;

      await user.save();

      return res.status(400).json({
        error: 'Código incorrecto.',
      });
    }

    const draft = await OnboardingDraft.findOne({
      email: cleanEmail,
      status: 'pending_email',
    });

    if (!draft) {
      return res.status(404).json({
        error: 'Onboarding no encontrado o expirado.',
      });
    }

    const username = draft.username;
    const rawAnswers: any = draft.answers || {};
    const normalized =
      draft.normalizedAnswers && Object.keys(draft.normalizedAnswers).length > 0
        ? draft.normalizedAnswers
        : normalizeOnboardingAnswers(rawAnswers);

    const account: any = draft.account || {};
    const rawProducts: any[] = Array.isArray(draft.products)
      ? draft.products
      : [];

    const validProducts = rawProducts.filter(
      (product) => product?.title?.trim() && product?.description?.trim()
    );

    const existingBot = await Bot.findOne({ owner: username });

    if (existingBot) {
      return res.status(409).json({
        error: 'Este usuario ya posee un bot creado.',
        code: 'BOT_ALREADY_EXISTS',
      });
    }

    user.emailVerified = true;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationCodeExpiry = undefined;
    user.emailVerificationAttempts = 0;

    await user.save();

    const collection = await CatalogCollection.create({
      owner: username,
      title: getCollectionTitle(normalized.businessType),
      fields: [],
    });

    const catalogItemIds: any[] = [];

    if (validProducts.length > 0) {
      for (const product of validProducts) {
        const priceNumber =
          product.price !== '' &&
          product.price !== null &&
          product.price !== undefined
            ? Number(product.price)
            : null;

        const item = await CatalogItem.create({
          owner: username,
          collectionId: collection._id,
          values: {
            title: product.title.trim(),
            description: buildProductDescription(product),
            price_eur: Number.isFinite(priceNumber) ? priceNumber : null,
          },
          images: [],
        });

        catalogItemIds.push(item._id);
      }
    }

    if (catalogItemIds.length === 0) {
      const fallbackItem = await CatalogItem.create({
        owner: username,
        collectionId: collection._id,
        values: {
          title:
            account.businessName ||
            normalized.businessName ||
            'Informações do negócio',
          description:
            normalized.businessDescription ||
            'Informações gerais cadastradas durante a criação do assistente.',
          price_eur: null,
        },
        images: [],
      });

      catalogItemIds.push(fallbackItem._id);
    }

    const bot = await Bot.create({
      name: 'Enki',
      persona: `Atendente virtual ${
        normalized.tone || normalized.assistantPersonality || 'profissional'
      } para ${normalized.businessType || 'negócio'}`,
      about: buildAbout({
        normalized,
        products: validProducts,
      }),
      guidelines: buildGuidelines(normalized),
      temperature: 0.5,
      product: [],
      catalogItems: catalogItemIds,
      companyName:
        account.businessName || normalized.businessName || '',
      address: normalized.location || '',
      email: account.email || cleanEmail,
      phone:
        account.phone ||
        normalized.whatsapp ||
        '',
      owner: username,
    });

    draft.normalizedAnswers = normalized;
    draft.status = 'completed';

    await draft.save();

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const chatUrl = `${frontendUrl}/chat/${username}`;

    return res.status(200).json({
      message: 'Cuenta verificada y asistente creado.',
      token,
      username,
      botId: bot._id,
      chatUrl,
      businessName:
        account.businessName || normalized.businessName || '',
    });
  } catch (error) {
    console.error('[ONBOARDING_VERIFY_CODE] error:', error);
    return res.status(500).json({
      error: 'Error al verificar código.',
    });
  }
});

export default router;