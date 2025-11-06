import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { authenticateJWT } from '../middleware/authMiddleware';
import CatalogCollection from '../../mongo/models/catalogCollectionModel';
import CatalogItem from '../../mongo/models/catalogItemModel';

const router = Router();

/** ===========================
 *  Uploads (multer)
 *  =========================== */
const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido (somente imagens).'));
  },
});

/** ===========================
 *  POST /api/catalog/collection — criar coleção
 *  body: { title: string }
 *  =========================== */
router.post('/catalog/collection', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { username: string };
    if (!user?.username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { title } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Título é obrigatório.' });
    }

    const created = await CatalogCollection.create({
      owner: user.username,
      title: String(title).trim(),
      // mantemos "fields" no schema por compatibilidade (aqui vazio)
      fields: [],
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error('[CATALOG] create collection error:', err);
    return res.status(500).json({ error: 'Erro ao criar coleção.' });
  }
});

/** ===========================
 *  GET /api/catalog/collection — listar coleções do dono
 *  =========================== */
router.get('/catalog/collection', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { username: string };
    if (!user?.username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const cols = await CatalogCollection.find({ owner: user.username }).sort({ createdAt: -1 }).lean();
    return res.status(200).json(cols);
  } catch (err) {
    console.error('[CATALOG] list collections error:', err);
    return res.status(500).json({ error: 'Erro ao listar coleções.' });
  }
});

/** ===========================
 *  POST /api/catalog/item — criar item
 *  multipart/form-data:
 *    - collectionId: string (ObjectId)
 *    - values: JSON string { title, description, price_eur|null, link|null }
 *    - images[]: files
 *  =========================== */
router.post(
  '/catalog/item',
  authenticateJWT,
  upload.array('images', 8),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as { username: string };
      if (!user?.username) return res.status(401).json({ error: 'Usuário não autenticado' });

      const { collectionId } = req.body;
      if (!collectionId) return res.status(400).json({ error: 'collectionId é obrigatório.' });

      const col = await CatalogCollection.findOne({ _id: collectionId, owner: user.username }).lean();
      if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });

      // parse values
      let values: any = {};
      if (typeof req.body.values === 'string') {
        try {
          values = JSON.parse(req.body.values);
        } catch {
          return res.status(400).json({ error: 'Campo "values" deve ser um JSON válido.' });
        }
      } else if (req.body.values && typeof req.body.values === 'object') {
        values = req.body.values;
      }

      // valida mínimos para leigos
      const title = String(values?.title ?? '').trim();
      const description = String(values?.description ?? '').trim();
      const link = values?.link ? String(values.link).trim() : null;
      const priceRaw = values?.price_eur;
      let price_eur: number | null = null;

      if (!title) return res.status(422).json({ error: 'Informe o nome do produto/serviço (title).' });
      if (!description) return res.status(422).json({ error: 'Informe a descrição.' });

      if (priceRaw !== undefined && priceRaw !== null && priceRaw !== '') {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) return res.status(422).json({ error: 'Preço inválido.' });
        price_eur = n;
      }

      // monta URLs de imagens
      const base = process.env.BASE_URL || 'http://localhost:4000';
      const files = (req.files as Express.Multer.File[]) || [];
      const imageUrls = files.map((f) => `${base}/uploads/${f.filename}`);

      const payloadValues = {
        title,
        description,
        price_eur, // null para ocultar
        link: link || null,
      };

      const created = await CatalogItem.create({
        owner: user.username,
        collectionId,
        values: payloadValues,
        images: imageUrls,
      });

      return res.status(201).json(created);
    } catch (err: any) {
      console.error('[CATALOG] create item error:', err);
      const msg =
        err?.message?.includes('JSON') || err?.message?.includes('Preço')
          ? err.message
          : 'Erro ao criar item.';
      return res.status(500).json({ error: msg });
    }
  }
);

/** ===========================
 *  GET /api/catalog/item/:collectionId — listar itens de uma coleção do dono
 *  =========================== */
router.get('/catalog/item/:collectionId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { username: string };
    if (!user?.username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { collectionId } = req.params;
    const col = await CatalogCollection.findOne({ _id: collectionId, owner: user.username }).lean();
    if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });

    const items = await CatalogItem.find({ owner: user.username, collectionId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(items);
  } catch (err) {
    console.error('[CATALOG] list items error:', err);
    return res.status(500).json({ error: 'Erro ao listar itens.' });
  }
});

export default router;
