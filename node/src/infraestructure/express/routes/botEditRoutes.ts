import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Bot from '../../mongo/models/botModel';
import Product from '../../mongo/models/productModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

/** Helpers */
function ensureString(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : '';
}

function clampTemperature(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

function parseProductIds(list: any): mongoose.Types.ObjectId[] | undefined {
  if (list === undefined) return undefined;
  const arr = Array.isArray(list) ? list : [list];
  const ids: mongoose.Types.ObjectId[] = [];
  for (const x of arr) {
    const s = String(x);
    if (mongoose.Types.ObjectId.isValid(s)) {
      ids.push(new mongoose.Types.ObjectId(s));
    }
  }
  return ids;
}

// Editar bot (rota separada)
router.put('/bot/edit/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID do bot inválido.' });
    }

    const authUser = (req as any).user as { username?: string };
    if (!authUser?.username) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    const bot = await Bot.findById(id);
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado.' });
    if (bot.owner !== authUser.username) {
      return res.status(403).json({ error: 'Acesso não autorizado.' });
    }

    // Campos opcionais (apenas atualiza se vier no body)
    const name = ensureString(req.body.name);
    const persona = ensureString(req.body.persona);
    const about = ensureString(req.body.about);           // ✅ "Quem somos"
    const guidelines = ensureString(req.body.guidelines); // ✅ Instruções do bot
    const temperature = clampTemperature(req.body.temperature);
    const companyName = ensureString(req.body.companyName);
    const address = ensureString(req.body.address);
    const email = ensureString(req.body.email);
    const phone = ensureString(req.body.phone);
    const productIds = parseProductIds(req.body.product);

    // (Opcional) validar se os produtos existem e pertencem ao mesmo owner
    if (productIds && productIds.length) {
      const count = await Product.countDocuments({
        _id: { $in: productIds },
        owner: authUser.username,
      });
      if (count !== productIds.length) {
        return res.status(422).json({
          error: 'Um ou mais produtos são inválidos ou não pertencem ao usuário.',
        });
      }
    }

    // Monta update incremental
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (persona !== undefined) update.persona = persona;
    if (about !== undefined) update.about = about; // ✅
    if (guidelines !== undefined) update.guidelines = guidelines; // ✅
    if (temperature !== undefined) update.temperature = temperature;
    if (productIds !== undefined) update.product = productIds;
    if (companyName !== undefined) update.companyName = companyName;
    if (address !== undefined) update.address = address;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;

    const updated = await Bot.findByIdAndUpdate(id, update, {
      new: true,
    }).populate('product');

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Erro ao atualizar bot:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o bot' });
  }
});

export default router;
