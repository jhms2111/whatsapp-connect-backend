// src/infraestructure/express/routes/webchatTrialRoutes.ts
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import twilio from 'twilio';

// Models
import Cliente from '../../mongo/models/clienteModel';
import WebchatQuota, { IWebchatQuota } from '../../mongo/models/webchatQuotaModel';
import WebchatTrialPhone from '../../mongo/models/WebchatTrialClaim'; // blocklist (telefone já usado)
import WebchatTrialCode from '../../mongo/models/WebchatTrialCode';   // 👈 NOVO: códigos temporários

// Middlewares
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireActiveUser } from '../middleware/requireActiveUser';

/** ========== Twilio ========== */
const twilioSid  = process.env.TWILIO_ACCOUNT_SID || '';
const twilioAuth = process.env.TWILIO_AUTH_TOKEN  || '';
const twilioFrom = process.env.TWILIO_FROM_NUMBER || '';

const twilioClient = (twilioSid && twilioAuth) ? twilio(twilioSid, twilioAuth) : null;

async function sendSmsE164(toE164: string, body: string) {
  if (!twilioClient) {
    console.warn('[WEBCHAT TRIAL] Twilio não configurado. Log-only:', toE164, body);
    return;
  }

  const senderId   = process.env.TWILIO_SENDER_ID || '';
  const fromNumber = twilioFrom || '';
  const from = senderId || fromNumber;

  if (!from) {
    throw new Error(
      'Nenhum remetente configurado. Defina TWILIO_SENDER_ID ou TWILIO_FROM_NUMBER.'
    );
  }

  console.log('[WEBCHAT TRIAL] SMS FROM =', from, 'TO =', toE164);

  await twilioClient.messages.create({
    to: toE164,
    from,
    body,
  });
}

/** ========== Utils ========== */
function normalizePhoneToE164(input: string): string {
  const raw = String(input || '').replace(/\s+/g, '');
  if (!raw) throw new Error('Telefone vazio');
  if (raw.startsWith('+')) {
    if (!/^\+\d{6,16}$/.test(raw)) throw new Error('Telefone inválido');
    return raw;
  }
  if (!/^\d{6,16}$/.test(raw)) throw new Error('Telefone inválido');
  return `+${raw}`;
}

const CODE_TTL_MS    = 10 * 60 * 1000;
const MAX_ATTEMPTS   = 5;
const TRIAL_CREDITS  = 100;
const gen6           = () => String(Math.floor(100000 + Math.random() * 900000));

/** ========== Rate limit ========== */
const limiterReqCode = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});
const limiterVerify = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/** ========== DTO status ========== */
type StatusDTO = {
  claimed: boolean;
  trialDisabled: boolean;
  claimedAt: Date | null;
  claimedPhone: string | null;
  totalConversations: number;
  usedConversations: number;
  periodStart: Date | null;
  periodEnd: Date | null;
};

async function readStatus(username: string): Promise<StatusDTO | null> {
  const cli = await Cliente.findOne(
    { username },
    {
      username: 1,
      'webchatTrial.claimed': 1,
      'webchatTrial.claimedAt': 1,
      'webchatTrial.phoneE164': 1,
      'webchatTrial.creditsGranted': 1,
      'webchatQuota.totalConversations': 1,
      'webchatQuota.usedConversations': 1,
      'webchatQuota.periodStart': 1,
      'webchatQuota.periodEnd': 1,
    }
  )
    .lean()
    .exec();

  if (!cli) return null;

  const anyCli = cli as any;
  const claimed = !!anyCli?.webchatTrial?.claimed;
  const creditsGranted = !!anyCli?.webchatTrial?.creditsGranted;

  return {
    claimed,
    trialDisabled: creditsGranted || claimed,
    claimedAt: anyCli?.webchatTrial?.claimedAt || null,
    claimedPhone: anyCli?.webchatTrial?.phoneE164 || null,
    totalConversations: anyCli?.webchatQuota?.totalConversations ?? 0,
    usedConversations: anyCli?.webchatQuota?.usedConversations ?? 0,
    periodStart: anyCli?.webchatQuota?.periodStart || null,
    periodEnd: anyCli?.webchatQuota?.periodEnd || null,
  };
}

/** ========== Router ========== */
const webchatTrialRouter = Router();

/** GET /status */
async function handleStatus(req: Request, res: Response) {
  try {
    const u = (req as any).user as { username: string };
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const status = await readStatus(u.username);
    if (!status) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json(status);
  } catch (e) {
    console.error('[WEBCHAT TRIAL][status] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

/** POST /request-code */
async function handleRequestCode(req: Request, res: Response) {
  try {
    const u = (req as any).user as { username: string };
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const phone = String(req.body?.phone || '').trim();
    if (!phone) return res.status(400).json({ error: 'Informe o telefone' });

    const phoneE164 = normalizePhoneToE164(phone);

    // Se a conta já ganhou créditos, nem envia SMS
    const alreadyGranted = await Cliente.findOne(
      { username: u.username, 'webchatTrial.creditsGranted': true },
      { _id: 1 }
    )
      .lean()
      .exec();
    if (alreadyGranted) {
      return res.status(409).json({ error: 'Trial já utilizado nesta conta.' });
    }

    // Blocklist global (número já usado em qualquer conta)
    const phoneBlocked = await WebchatTrialPhone.findOne({ phone }, { _id: 1 }).lean().exec();
    if (phoneBlocked) {
      return res.status(409).json({ error: 'Este telefone já foi usado para ativar o trial.' });
    }

    // Bloqueia reuso do mesmo telefone por outra conta
    const existsOnOther = await Cliente.findOne(
      {
        'webchatTrial.phoneE164': phoneE164,
        'webchatTrial.claimed': true,
        username: { $ne: u.username },
      },
      { _id: 1 }
    )
      .lean()
      .exec();
    if (existsOnOther) {
      return res.status(409).json({
        error: 'Este telefone já foi usado para ativar o trial em outra conta.',
      });
    }

    // Gera e guarda código no Mongo (TTL)
    const code = gen6();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await WebchatTrialCode.findOneAndUpdate(
      { username: u.username, phoneE164 },
      {
        code,
        expiresAt,
        attempts: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    console.log(
      `[WEBCHAT TRIAL][SMS] Enviando para ${phoneE164}: Seu código de verificação para ativar 100 conversas ENKI é: ${code}`
    );
    await sendSmsE164(
      phoneE164,
      `Seu código de verificação para ativar as 100 conversas é: ${code}`
    );

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[WEBCHAT TRIAL][request-code] erro:', e);
    return res.status(500).json({ error: e?.message || 'Erro ao enviar código' });
  }
}

/** POST /verify-code */
async function handleVerifyCode(req: Request, res: Response) {
  try {
    const u = (req as any).user as { username: string };
    if (!u?.username) return res.status(401).json({ error: 'Auth ausente' });

    const phone = String(req.body?.phone || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!phone || !code) {
      return res.status(400).json({ error: 'Telefone e código são obrigatórios' });
    }

    const phoneE164 = normalizePhoneToE164(phone);

    // Busca código no Mongo (username + phoneE164)
    const rec = await WebchatTrialCode.findOne({ username: u.username, phoneE164 }).exec();
    if (!rec) {
      return res.status(400).json({ error: 'Solicite um código primeiro' });
    }

    // Verifica expiração
    if (rec.expiresAt.getTime() < Date.now()) {
      await WebchatTrialCode.deleteOne({ _id: rec._id }).exec();
      return res.status(400).json({ error: 'Código expirado. Solicite novamente.' });
    }

    // Verifica limite de tentativas
    if (rec.attempts >= MAX_ATTEMPTS) {
      await WebchatTrialCode.deleteOne({ _id: rec._id }).exec();
      return res.status(429).json({ error: 'Muitas tentativas. Solicite novo código.' });
    }

    // Verifica código
    if (code !== rec.code) {
      rec.attempts += 1;
      await rec.save();
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Código válido → pode apagar o registro de código
    await WebchatTrialCode.deleteOne({ _id: rec._id }).exec();

    // Blocklist global (antes de conceder, checar de novo)
    const phoneBlocked = await WebchatTrialPhone.findOne({ phone }, { _id: 1 }).lean().exec();
    if (phoneBlocked) {
      return res.status(409).json({ error: 'Este telefone já foi usado para ativar o trial.' });
    }

    // Impede reuso do mesmo telefone por outra conta (defesa extra)
    const existsOnOther = await Cliente.findOne(
      {
        'webchatTrial.phoneE164': phoneE164,
        'webchatTrial.claimed': true,
        username: { $ne: u.username },
      },
      { _id: 1 }
    )
      .lean()
      .exec();
    if (existsOnOther) {
      return res.status(409).json({
        error: 'Este telefone já foi usado para ativar o trial em outra conta.',
      });
    }

    // ===== Idempotência: garantir que só credita uma única vez =====
    const now = new Date();

    const updatedCliente = await Cliente.findOneAndUpdate(
      {
        username: u.username,
        'webchatTrial.claimed': { $ne: true },
        'webchatTrial.creditsGranted': { $ne: true },
      },
      {
        $set: {
          'webchatTrial.claimed': true,
          'webchatTrial.claimedAt': now,
          'webchatTrial.phoneE164': phoneE164,
          'webchatTrial.creditsGranted': true,
        },
      },
      { new: true }
    )
      .lean()
      .exec();

    if (!updatedCliente) {
      return res
        .status(409)
        .json({ error: 'Trial já utilizado para este número/conta.' });
    }

    // Blocklist: grava definitivamente o número
    try {
      await WebchatTrialPhone.create({
        username: u.username,
        phone: phoneE164,
        claimedAt: now,
        amount: TRIAL_CREDITS,
      });
    } catch {
      return res.status(409).json({
        error: 'Este telefone já foi usado para ativar o trial.',
      });
    }

    // Concede os créditos (primeira vez)
    const periodStart = now;
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const updatedQuota = await WebchatQuota.findOneAndUpdate(
      { username: u.username },
      {
        $inc: { totalConversations: TRIAL_CREDITS },
        $setOnInsert: {
          username: u.username,
          usedCharacters: 0,
          packageType: null,
          lastStripeCheckoutId: null,
          coins: 0,
          coinsExpiresAt: null,
          createdAt: now,
        },
        $set: { periodStart, periodEnd, updatedAt: now },
      },
      { upsert: true, new: true }
    )
      .lean<IWebchatQuota>()
      .exec();

    return res.json({
      ok: true,
      granted: TRIAL_CREDITS,
      totalConversations: updatedQuota?.totalConversations ?? TRIAL_CREDITS,
      periodStart,
      periodEnd,
    });
  } catch (e) {
    console.error('[WEBCHAT TRIAL][verify-code] erro:', e);
    return res.status(500).json({ error: 'Erro interno ao verificar' });
  }
}

/** ========== Rotas — aceitamos os DOIS caminhos ========== */
/** /api/webchat/free-trial/* */
webchatTrialRouter.get(
  '/webchat/free-trial/status',
  authenticateJWT,
  requireActiveUser,
  handleStatus
);
webchatTrialRouter.post(
  '/webchat/free-trial/request-code',
  authenticateJWT,
  requireActiveUser,
  limiterReqCode,
  handleRequestCode
);
webchatTrialRouter.post(
  '/webchat/free-trial/verify-code',
  authenticateJWT,
  requireActiveUser,
  limiterVerify,
  handleVerifyCode
);

/** /api/webchat/trial/* (ALIAS) */
webchatTrialRouter.get(
  '/webchat/trial/status',
  authenticateJWT,
  requireActiveUser,
  handleStatus
);
webchatTrialRouter.post(
  '/webchat/trial/request-code',
  authenticateJWT,
  requireActiveUser,
  limiterReqCode,
  handleRequestCode
);
webchatTrialRouter.post(
  '/webchat/trial/verify-code',
  authenticateJWT,
  requireActiveUser,
  limiterVerify,
  handleVerifyCode
);

export default webchatTrialRouter;
