// src/infraestructure/express/routes/whatsappWebhook.ts
import { Router, Request, Response } from 'express';
import Cliente, { ICliente } from '../../mongo/models/clienteModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import FollowUpSchedule from '../../mongo/models/followUpQueueModel';
import { saveMessage } from '../../mongo/mongodbAdapter';
import { Server as IOServer } from 'socket.io';

const router = Router();

let io: IOServer | undefined;
export const injectSocketIO = (_io: IOServer) => { io = _io; };

type OwnerLookup = { owner?: string };

// Normaliza + confere o dono do número Twilio aceitando com/sem "whatsapp:"
async function resolveOwnerUsernameFromInbound(req: Request): Promise<{
  ownerUsername: string | null;
  toNumber: string | null;   // sempre com prefixo whatsapp:+...
  fromNumber: string | null; // sempre com prefixo whatsapp:+...
  toE164: string | null;     // +E164 sem "whatsapp:"
  fromE164: string | null;   // +E164 sem "whatsapp:"
}> {
  const rawTo = String(req.body?.To ?? req.body?.to ?? '').trim();       // ex: "whatsapp:+1831..."
  const rawFrom = String(req.body?.From ?? req.body?.from ?? '').trim(); // ex: "whatsapp:+3467..."

  if (!rawTo || !rawFrom) {
    return { ownerUsername: null, toNumber: null, fromNumber: null, toE164: null, fromE164: null };
  }

  const toBare = rawTo.replace(/^whatsapp:/, '');
  const fromBare = rawFrom.replace(/^whatsapp:/, '');

  const toE164 = toBare.startsWith('+') ? toBare : `+${toBare.replace(/[^\d]/g, '')}`;
  const fromE164 = fromBare.startsWith('+') ? fromBare : `+${fromBare.replace(/[^\d]/g, '')}`;

  const withWpTo = `whatsapp:${toE164}`;

  const rec = await TwilioNumber.findOne(
    { number: { $in: [toE164, withWpTo] } },
    { owner: 1 }
  )
    .lean<OwnerLookup>()
    .exec();

  const ownerUsername = rec?.owner ?? null;

  return { ownerUsername, toNumber: `whatsapp:${toE164}`, fromNumber: `whatsapp:${fromE164}`, toE164, fromE164 };
}

router.post(['/whatsapp/webhook', '/webhook/whatsapp'], async (req: Request, res: Response) => {
  try {
    const { ownerUsername, toNumber, fromNumber, toE164, fromE164 } = await resolveOwnerUsernameFromInbound(req);
    if (!ownerUsername || !toNumber || !fromNumber || !toE164 || !fromE164) {
      console.log('[WEBHOOK] Ignorado: owner/to/from ausentes');
      return res.status(200).send('IGNORED_NO_OWNER');
    }

    const cli = await Cliente.findOne(
      { username: ownerUsername },
      { status: 1, botsEnabled: 1, followUpEnabled: 1, followUpDelayMinutes: 1 }
    )
      .lean<Pick<ICliente, 'status' | 'botsEnabled' | 'followUpEnabled' | 'followUpDelayMinutes'>>()
      .exec();

    if (cli?.followUpEnabled) {
      const delay = typeof cli.followUpDelayMinutes === 'number' ? cli.followUpDelayMinutes : 60;
      const due = new Date(Date.now() + delay * 60 * 1000);

      await FollowUpSchedule.findOneAndUpdate(
        { ownerUsername, from: fromNumber, to: toNumber, sent: false },
        { $set: { scheduledAt: due }, $setOnInsert: { sent: false } },
        { upsert: true, new: true }
      )
        .lean()
        .exec();
    }

    if (cli?.status === 'blocked') return res.status(200).send('IGNORED_BLOCKED_USER');
    if (cli && !cli.botsEnabled) return res.status(200).send('IGNORED_BOTS_OFF');

    // ==== EMISSÃO EM TEMPO REAL + SAVE ====
    const fromClean = fromE164.replace(/[^\d]/g, ''); // só dígitos
    const toClean = toE164.replace(/[^\d]/g, '');     // só dígitos
    const roomId = `${fromClean}___${toClean}`;
    const sender = `Socket-twilio-${roomId}`;

    const body = String(req.body?.Body ?? '');

    if (body) {
      try {
        if (io) {
          io.to(roomId).emit('twilio message', {
            sender,
            message: body,
            roomId,
            timestamp: new Date()
          });
        } else {
          console.warn('[whatsapp/webhook] io não está injetado; pulando broadcast.');
        }

        await saveMessage(roomId, sender, body, true, undefined, undefined, ownerUsername);
      } catch (emitOrSaveErr) {
        console.error('[whatsapp/webhook] falha ao emitir/salvar inbound:', emitOrSaveErr);
      }
    }

    // TODO: tratar mídias se necessário (MediaUrl0, MediaContentType0) com download/emit/save

    return res.status(200).send('OK');
  } catch (e) {
    console.error('[whatsapp/webhook] erro:', e);
    return res.status(200).send('IGNORED_ERROR');
  }
});

export default router;
