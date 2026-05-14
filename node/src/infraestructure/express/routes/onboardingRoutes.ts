// src/infraestructure/express/routes/onboardingRoutes.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../../mongo/models/userModel';
import OnboardingDraft from '../../mongo/models/onboardingDraftModel';
import CatalogCollection from '../../mongo/models/CatalogCollection';
import CatalogItem from '../../mongo/models/CatalogItem';
import Bot from '../../mongo/models/botModel';

import { sendEmail } from '../../../utils/email';

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

function getCollectionTitle(businessType?: string) {
  const map: Record<string, string> = {
    restaurant: 'Cardapio',
    clinic: 'Servicos',
    online_store: 'Produtos',
    services: 'Servicos',
    real_estate: 'Imoveis',
    school: 'Cursos',
    beauty: 'Tratamentos',
    other: 'Ofertas',
  };

  return map[businessType || ''] || 'Ofertas';
}

function buildProductDescription(product: any) {
  const description = product?.description?.trim() || '';
  const link = product?.link?.trim();

  if (link) {
    return `${description}\n\nLink: ${link}`;
  }

  return description;
}

function buildAbout({
  answers,
  products,
}: {
  answers: any;
  products: any[];
}) {
  const productText =
    products.length > 0
      ? products
          .map((p) => {
            const price = p.price ? ` | Preço: ${p.price}` : '';
            const link = p.link ? ` | Link: ${p.link}` : '';
            return `- ${p.title}: ${p.description || ''}${price}${link}`;
          })
          .join('\n')
      : 'Nenhum produto ou serviço informado.';

  return `
Tipo de negócio: ${answers.businessType || ''}

Descrição do negócio:
${answers.businessDescription || ''}

Produtos ou serviços principais:
${productText}

Horários de atendimento:
${answers.openingHours || ''}

Formas de pagamento:
${Array.isArray(answers.paymentMethods) ? answers.paymentMethods.join(', ') : answers.paymentMethods || ''}

Perguntas frequentes:
${answers.faq || ''}
`.trim();
}

function buildGuidelines(answers: any) {
  const languageInstruction: Record<string, string> = {
    pt: 'Responda sempre em português, a menos que o cliente peça outro idioma.',
    es: 'Responde siempre en español, a menos que el cliente pida otro idioma.',
    en: 'Always reply in English unless the customer asks for another language.',
  };

  const lang = answers.language || 'pt';

  return `
Você é o assistente virtual oficial deste negócio.

IDIOMA:
- ${languageInstruction[lang] || languageInstruction.pt}

OBJETIVO:
- ${Array.isArray(answers.goal) ? answers.goal.join(', ') : answers.goal || 'Ajudar clientes com informações do negócio.'}

TOM DE VOZ:
- ${answers.tone || 'profissional e simpático'}

REGRAS:
- Seja educado, claro e humano.
- Responda em mensagens curtas.
- Nunca invente preços, horários, promoções, prazos ou políticas.
- Use apenas as informações cadastradas sobre a empresa.
- Se não souber responder, diga que precisa confirmar com a equipe.
- Se o cliente pedir atendimento humano, encaminhe educadamente.
- Conduza a conversa com perguntas simples.

QUANDO CHAMAR UM HUMANO:
- ${Array.isArray(answers.humanHandoff) ? answers.humanHandoff.join(', ') : answers.humanHandoff || 'Quando não souber responder ou quando o cliente pedir.'}
`.trim();
}

router.post('/onboarding/start', async (req: Request, res: Response) => {
  try {
    const { username, email, password, answers, products, account } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Usuario, email y contraseña son obligatorios.' });
    }

    if (!answers || !account) {
      return res.status(400).json({ error: 'Datos del onboarding incompletos.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUsername = String(username).trim();

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
      user.emailVerificationCodeHash = codeHash;
      user.emailVerificationCodeExpiry = codeExpiry();
      user.emailVerificationAttempts = 0;
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    await OnboardingDraft.findOneAndUpdate(
      { email: cleanEmail },
      {
        username: cleanUsername,
        email: cleanEmail,
        answers,
        products: Array.isArray(products) ? products : [],
        account,
        status: 'pending_email',
        expiresAt: in24h(),
      },
      { upsert: true, new: true }
    );

    await sendEmail({
      to: cleanEmail,
      subject: 'Tu código de confirmación ENKI',
      text: `Tu código ENKI es: ${code}. Es válido por 15 minutos.`,
      html: enkiCodeEmailTemplate({ username: cleanUsername, code }),
    });

    return res.status(200).json({
      message: 'Código enviado al email.',
      code: 'EMAIL_CODE_SENT',
    });
  } catch (error) {
    console.error('[ONBOARDING_START] error:', error);
    return res.status(500).json({ error: 'Error al iniciar onboarding.' });
  }
});

router.post('/onboarding/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email y código son obligatorios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.emailVerificationCodeHash) {
      return res.status(400).json({ error: 'Código inválido o expirado.' });
    }

    if (
      !user.emailVerificationCodeExpiry ||
      user.emailVerificationCodeExpiry.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: 'Código expirado.' });
    }

    if ((user.emailVerificationAttempts || 0) >= 5) {
      return res.status(429).json({
        error: 'Demasiados intentos. Solicita un nuevo código.',
      });
    }

    const validCode = await bcrypt.compare(cleanCode, user.emailVerificationCodeHash);

    if (!validCode) {
      user.emailVerificationAttempts = (user.emailVerificationAttempts || 0) + 1;
      await user.save();

      return res.status(400).json({ error: 'Código incorrecto.' });
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
    const answers: any = draft.answers || {};
    const account: any = draft.account || {};
    const rawProducts: any[] = Array.isArray(draft.products) ? draft.products : [];

    const validProducts = rawProducts.filter(
      (p) => p?.title?.trim() && p?.description?.trim()
    );

    user.emailVerified = true;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationCodeExpiry = undefined;
    user.emailVerificationAttempts = 0;
    await user.save();

    let catalogItemIds: any[] = [];

    const collection = await CatalogCollection.create({
      owner: username,
      title: getCollectionTitle(answers.businessType),
      fields: [],
    });

    if (validProducts.length > 0) {
      for (const product of validProducts) {
        const priceNumber =
          product.price !== '' && product.price !== null && product.price !== undefined
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
          title: account.businessName || 'Informações do negócio',
          description:
            answers.businessDescription ||
            'Informações gerais cadastradas durante a criação do assistente.',
          price_eur: null,
        },
        images: [],
      });

      catalogItemIds.push(fallbackItem._id);
    }

    const existingBot = await Bot.findOne({ owner: username });

    if (existingBot) {
      return res.status(409).json({
        error: 'Este usuário já possui um bot criado.',
        code: 'BOT_ALREADY_EXISTS',
      });
    }

    const bot = await Bot.create({
      name: 'Enki',
      persona: `Atendente virtual ${answers.tone || 'profissional'} para ${answers.businessType || 'negócio'}`,
      about: buildAbout({ answers, products: validProducts }),
      guidelines: buildGuidelines(answers),
      temperature: 0.5,
      product: [],
      catalogItems: catalogItemIds,
      companyName: account.businessName || '',
      address: '',
      email: account.email || cleanEmail,
      phone: account.phone || '',
      owner: username,
    });

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
      businessName: account.businessName || '',
    });
  } catch (error) {
    console.error('[ONBOARDING_VERIFY_CODE] error:', error);
    return res.status(500).json({ error: 'Error al verificar código.' });
  }
});

export default router;