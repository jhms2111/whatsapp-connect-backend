// src/infraestructure/express/workers/followUpWorker.ts
import { Server as IOServer } from 'socket.io';
import Cliente, { ICliente } from '../../mongo/models/clienteModel';
import FollowUpSchedule, { IFollowUpSchedule } from '../../mongo/models/followUpQueueModel';
import { sendMessageToTwilio } from '../../../modules/twilio/adapter/config';
import { saveMessage } from '../../mongo/mongodbAdapter';

type FollowDoc = Pick<
  IFollowUpSchedule,
  '_id' | 'ownerUsername' | 'from' | 'to' | 'scheduledAt' | 'sent' | 'sentAt'
>;

function stripToDigits(value?: string | null): string {
  const s = (value || '').replace(/^whatsapp:/i, '');
  return s.replace(/\D+/g, '');
}

function buildRoomId(from?: string | null, to?: string | null): string {
  const fromClean = stripToDigits(from);
  const toClean = stripToDigits(to);
  return `${fromClean}___${toClean}`;
}

export function startFollowUpWorker(io: IOServer, intervalMs = 30_000) {
  console.log(`[followUpWorker] Iniciando worker com intervalo de ${intervalMs}ms`);

  async function tick() {
    try {
      const now = new Date();
      console.log('[followUpWorker] tick @', now.toISOString());

      const due = await FollowUpSchedule.find({
        sent: false,
        scheduledAt: { $lte: now },
      })
        .sort({ scheduledAt: 1 })
        .limit(50)
        .lean<FollowDoc[]>()
        .exec();

      console.log(`[followUpWorker] encontrados ${due.length} itens vencidos`);

      if (!due.length) return;

      for (const item of due) {
        console.log('[followUpWorker] processando item:', {
          id: String(item._id),
          owner: item.ownerUsername,
          from: item.from,
          to: item.to,
          scheduledAt: item.scheduledAt?.toISOString?.() ?? item.scheduledAt,
        });

        try {
          const owner = item.ownerUsername;
          if (!owner) {
            await FollowUpSchedule.updateOne(
              { _id: item._id },
              { $set: { sent: true, sentAt: new Date() } }
            );
            continue;
          }

          const cli = await Cliente.findOne(
            { username: owner },
            { status: 1, botsEnabled: 1, followUpEnabled: 1, followUpMessage: 1 }
          )
            .lean<ICliente | null>()
            .exec();

          if (!cli) {
            console.warn('[followUpWorker] cliente não encontrado, marcando como sent');
            await FollowUpSchedule.updateOne(
              { _id: item._id },
              { $set: { sent: true, sentAt: new Date() } }
            );
            continue;
          }

          if (cli.status === 'blocked' || !cli.botsEnabled || !cli.followUpEnabled) {
            console.warn('[followUpWorker] bloqueado/disabled, marcando como sent');
            await FollowUpSchedule.updateOne(
              { _id: item._id },
              { $set: { sent: true, sentAt: new Date() } }
            );
            continue;
          }

          const text = (cli.followUpMessage || '').trim();
          if (!text) {
            console.warn('[followUpWorker] followUpMessage vazio, marcando como sent');
            await FollowUpSchedule.updateOne(
              { _id: item._id },
              { $set: { sent: true, sentAt: new Date() } }
            );
            continue;
          }

          // Envia a mensagem PRÉ-DEFINIDA (sem IA)
          const toUserDigits = stripToDigits(item.from);
          const fromTwilioRaw = item.to;
          console.log('[followUpWorker] enviando follow-up...', { toUserDigits, fromTwilioRaw });
          await sendMessageToTwilio(text, toUserDigits, fromTwilioRaw);

          // Salva/Socket
          const roomId = buildRoomId(item.from, item.to);
          await saveMessage(roomId, 'Bot', text, true);

          io.to(roomId).emit('twilio message', { sender: 'Bot', message: text });
          io.emit('historicalRoomUpdated', {
            roomId,
            lastMessage: text,
            lastTimestamp: new Date(),
          });

          await FollowUpSchedule.updateOne(
            { _id: item._id },
            { $set: { sent: true, sentAt: new Date() } }
          );

          console.log('[followUpWorker] follow-up enviado e item marcado como sent');
        } catch (e) {
          console.error('[followUpWorker] erro no item', String(item?._id), e);
        }
      }
    } catch (outer) {
      console.error('[followUpWorker] tick error:', outer);
    }
  }

  setInterval(tick, intervalMs);
  setTimeout(tick, 5_000);
}

export default startFollowUpWorker;
