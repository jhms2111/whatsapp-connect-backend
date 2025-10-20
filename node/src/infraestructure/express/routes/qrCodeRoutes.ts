import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import adminOnly from '../middleware/adminMiddleware';
import QRCodeModel, { IQRCode } from '../../mongo/models/qrCodeModel';

const router = Router();

// Diretório físico (mesmo do estático /uploads)
const uploadRoot = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

// Multer: salva com nome único
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safe = (file.originalname || 'qr.png').replace(/[^\w.\-]/g, '_');
    cb(null, `${unique}-${safe}`);
  },
});
const upload = multer({ storage });

// Base atual (usa BASE_URL se setada; senão, host da requisição)
function currentBase(req: Request) {
  const env = (process.env.BASE_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  const proto = req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

// Normaliza URL pública para o host atual
function normalizePublicUrl(req: Request, storedUrl: string | null | undefined): string | null {
  if (!storedUrl) return null;
  const marker = '/uploads/';
  const idx = storedUrl.indexOf(marker);
  if (idx === -1) return storedUrl;
  const rel = storedUrl.substring(idx); // ex.: /uploads/123-file.png
  return encodeURI(currentBase(req) + rel);
}

/**
 * GET /api/qr/:username
 * Retorna a URL normalizada (corrige domínio de ngrok antigo)
 */
router.get('/qr/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const doc = await QRCodeModel.findOne({ ownerUsername: username }).lean<IQRCode | null>();
    if (!doc) return res.json({ imageUrl: null });

    const imageUrl = normalizePublicUrl(req, doc.imageUrl);

    return res.json({
      imageUrl,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
    });
  } catch (e) {
    console.error('[QR][GET] erro:', e);
    return res.status(500).json({ error: 'Erro ao buscar QR' });
  }
});

// Admin dentro da conta?
function isAdminInsideAccount(req: Request, targetUsername: string) {
  const u = (req as any).user as {
    username: string;
    role?: string;
    imp?: boolean;
    actAsAdmin?: boolean;
  } | undefined;
  if (!u) return false;

  if (u.imp) return !u.username || u.username === targetUsername;

  const xImp = String(req.headers['x-impersonate'] || '').toLowerCase() === 'true';
  const xUser = String(req.headers['x-impersonate-user'] || '');
  const isAdmin = u.role === 'admin' || u.actAsAdmin === true;
  return Boolean(isAdmin && xImp && xUser && xUser === targetUsername);
}

/**
 * POST /api/admin/qr/:username
 * Campo do arquivo: "qrImage"
 */
router.post(
  '/admin/qr/:username',
  adminOnly,
  upload.single('qrImage'),
  async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      if (!isAdminInsideAccount(req, username)) {
        return res.status(403).json({
          error:
            'Apenas administradores dentro da conta do usuário (impersonate) podem alterar o QR.',
        });
      }

      if (!req.file) return res.status(400).json({ error: 'Arquivo (qrImage) ausente' });

      const absoluteUrl = encodeURI(`${currentBase(req)}/uploads/${req.file.filename}`);

      const updated = await QRCodeModel.findOneAndUpdate(
        { ownerUsername: username },
        {
          $set: {
            imageUrl: absoluteUrl,
            originalName: req.file.originalname || null,
          },
        },
        { upsert: true, new: true }
      ).lean<IQRCode | null>();

      return res.json({
        ok: true,
        imageUrl: normalizePublicUrl(req, updated?.imageUrl || absoluteUrl),
        updatedAt: updated?.updatedAt || new Date(),
      });
    } catch (e) {
      console.error('[QR][POST] erro:', e);
      return res.status(500).json({ error: 'Falha ao salvar QR' });
    }
  }
);

/**
 * DELETE /api/admin/qr/:username
 */
router.delete('/admin/qr/:username', adminOnly, async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!isAdminInsideAccount(req, username)) {
      return res.status(403).json({
        error:
          'Apenas administradores dentro da conta do usuário (impersonate) podem excluir o QR.',
      });
    }

    const doc = await QRCodeModel.findOneAndDelete({ ownerUsername: username }).lean<IQRCode | null>();
    if (doc?.imageUrl) {
      const marker = '/uploads/';
      const pos = doc.imageUrl.indexOf(marker);
      if (pos >= 0) {
        const rel = doc.imageUrl.substring(pos + marker.length).split('?')[0];
        const filePath = path.join(uploadRoot, rel);
        fs.promises.unlink(filePath).catch(() => {});
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[QR][DELETE] erro:', e);
    return res.status(500).json({ error: 'Falha ao excluir QR' });
  }
});

export default router;
