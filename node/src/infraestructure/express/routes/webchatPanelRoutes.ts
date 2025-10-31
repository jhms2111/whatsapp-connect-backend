import { Router, Request, Response } from 'express';
import Message from '../../mongo/models/messageModel';

const router = Router();

/**
 * POST /api/webchat/panel/send
 * Salva mensagem enviada pelo painel (admin/atendente).
 * Dedupe simples: evita duplicar se já existir registro idêntico (roomId, sender, message, timestamp).
 */
router.post('/webchat/panel/send', async (req: Request, res: Response) => {
  try {
    const { roomId, sender, message, timestamp } = req.body || {};

    if (!roomId || !sender || !message) {
      return res.status(400).json({ error: 'roomId, sender e message são obrigatórios.' });
    }

    const ts = timestamp || new Date().toISOString();

    // Dedupe: se já existir uma mensagem idêntica, retorna a existente
    const existing = await Message.findOne({ roomId, sender, message, timestamp: ts }).lean();
    if (existing) {
      return res.json({ ok: true, duplicated: true, doc: existing });
    }

    const doc = await Message.create({ roomId, sender, message, timestamp: ts });

    // Opcional: NÃO emitimos via socket aqui porque o socket do painel já emitiu.
    // Se você quiser emitir também por HTTP (quando o painel não usa socket), injete 'io' via contexto.

    return res.json({ ok: true, doc });
  } catch (e: any) {
    console.error('[POST /api/webchat/panel/send] erro:', e);
    return res.status(500).json({ error: 'Falha ao salvar mensagem do painel.' });
  }
});

export default router;
