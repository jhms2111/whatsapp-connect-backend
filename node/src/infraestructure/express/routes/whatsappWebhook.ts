// src/infraestructure/express/routes/whatsappWebhook.ts
import { Router, Request, Response } from 'express';
import Cliente, { ICliente } from '../../mongo/models/clienteModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import FollowUpSchedule from '../../mongo/models/followUpQueueModel';

const router = Router();

type OwnerLookup = { owner?: string };

// Normaliza + confere o dono do número Twilio aceitando com/sem "whatsapp:"
async function resolveOwnerUsernameFromInbound(req: Request): Promise<{
  ownerUsername: string | null;
  toNumber: string | null;   // sempre com prefixo whatsapp:+...
  fromNumber: string | null; // sempre com prefixo whatsapp:+...
}> {
  const rawTo = String(req.body?.To ?? req.body?.to ?? '').trim();       // ex: "whatsapp:+1831..."
  const rawFrom = String(req.body?.From ?? req.body?.from ?? '').trim(); // ex: "whatsapp:+3467..."

  if (!rawTo || !rawFrom) return { ownerUsername: null, toNumber: null, fromNumber: null };

  const toBare = rawTo.replace(/^whatsapp:/, '');
  const fromBare = rawFrom.replace(/^whatsapp:/, '');

  const toE164 = toBare.startsWith('+') ? toBare : `+${toBare.replace(/[^\d]/g, '')}`;
  const fromE164 = fromBare.startsWith('+') ? fromBare : `+${fromBare.replace(/[^\d]/g, '')}`;

  const withWpTo = `whatsapp:${toE164}`;
  const withWpFrom = `whatsapp:${fromE164}`;

  // procura no banco por qualquer formato salvo
  const rec = await TwilioNumber.findOne(
    { number: { $in: [toE164, withWpTo] } },
    { owner: 1 }
  )
    .lean<OwnerLookup>()
    .exec();

  const ownerUsername = rec?.owner ?? null;

  return { ownerUsername, toNumber: withWpTo, fromNumber: withWpFrom };
}

router.post(['/whatsapp/webhook', '/webhook/whatsapp'], async (req: Request, res: Response) => {
  try {
    const { ownerUsername, toNumber, fromNumber } = await resolveOwnerUsernameFromInbound(req);
    if (!ownerUsername || !toNumber || !fromNumber) {
      console.log('[WEBHOOK] Ignorado: owner/to/from ausentes');
      return res.status(200).send('IGNORED_NO_OWNER');
    }

    // Tipar explicitamente os campos que vamos ler
    const cli = await Cliente.findOne(
      { username: ownerUsername },
      { status: 1, botsEnabled: 1, followUpEnabled: 1, followUpDelayMinutes: 1 }
    )
      .lean<Pick<ICliente, 'status' | 'botsEnabled' | 'followUpEnabled' | 'followUpDelayMinutes'>>()
      .exec();

    // Agenda/reatualiza follow-up apenas se habilitado
    if (cli?.followUpEnabled) {
      const delay = typeof cli.followUpDelayMinutes === 'number' ? cli.followUpDelayMinutes : 60;
      const due = new Date(Date.now() + delay * 60 * 1000);

      // 1 pendente por conversa (owner+from+to, sent:false). Nova inbound reprograma o scheduledAt.
      await FollowUpSchedule.findOneAndUpdate(
        { ownerUsername, from: fromNumber, to: toNumber, sent: false },
        { $set: { scheduledAt: due }, $setOnInsert: { sent: false } },
        { upsert: true, new: true }
      )
        .lean()
        .exec();
    }

    // Regras de bloqueio/bots
    if (cli?.status === 'blocked') return res.status(200).send('IGNORED_BLOCKED_USER');
    if (cli && !cli.botsEnabled) return res.status(200).send('IGNORED_BOTS_OFF');

    return res.status(200).send('OK');
  } catch (e) {
    console.error('[whatsapp/webhook] erro:', e);
    return res.status(200).send('IGNORED_ERROR');
  }
});

export default router;
