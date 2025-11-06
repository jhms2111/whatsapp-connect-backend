// src/infraestructure/express/routes/catalogRoutes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';

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
 *  Helpers internos
 *  =========================== */
function ensureAuthUser(req: Request): string | null {
  const user = (req as any).user as { username?: string };
  return user?.username || null;
}

/** ===========================
 *  POST /api/catalog/collection — criar coleção
 *  =========================== */
router.post('/catalog/collection', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { title } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Título é obrigatório.' });
    }

    const created = await CatalogCollection.create({
      owner: username,
      title: String(title).trim(),
      fields: [], // compatibilidade
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error('[CATALOG] create collection error:', err);
    return res.status(500).json({ error: 'Erro ao criar coleção.' });
  }
});

/** ===========================
 *  GET /api/catalog/collection — listar coleções do dono
 *  (rota original)
 *  =========================== */
router.get('/catalog/collection', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const cols = await CatalogCollection.find({ owner: username }).sort({ createdAt: -1 }).lean();
    return res.status(200).json(cols);
  } catch (err) {
    console.error('[CATALOG] list collections error:', err);
    return res.status(500).json({ error: 'Erro ao listar coleções.' });
  }
});

/** ===========================
 *  GET /api/catalog/collections — ALIAS compatível com o front
 *  (chama o mesmo handler acima sem duplicar lógica)
 *  =========================== */
// alias em plural para compatibilidade com o front
router.get('/catalog/collections', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { username: string };
    if (!user?.username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const cols = await CatalogCollection.find({ owner: user.username })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(cols);
  } catch (err) {
    console.error('[CATALOG] list collections (plural) error:', err);
    return res.status(500).json({ error: 'Erro ao listar coleções.' });
  }
});


/** ===========================
 *  POST /api/catalog/item — criar item (multipart/form-data)
 *  (rota original que recebe collectionId no body)
 *  =========================== */
router.post(
  '/catalog/item',
  authenticateJWT,
  upload.array('images', 8),
  async (req: Request, res: Response) => {
    try {
      const username = ensureAuthUser(req);
      if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

      const { collectionId } = req.body;
      if (!collectionId) return res.status(400).json({ error: 'collectionId é obrigatório.' });

      const col = await CatalogCollection.findOne({ _id: collectionId, owner: username }).lean();
      if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });

      // parse values
      let values: any = {};
      if (typeof req.body.values === 'string') {
        try { values = JSON.parse(req.body.values); }
        catch { return res.status(400).json({ error: 'Campo "values" deve ser um JSON válido.' }); }
      } else if (req.body.values && typeof req.body.values === 'object') {
        values = req.body.values;
      }

      // valida mínimos
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

      // URLs de imagens
      const base = process.env.BASE_URL || 'http://localhost:4000';
      const files = (req.files as Express.Multer.File[]) || [];
      const imageUrls = files.map((f) => `${base}/uploads/${f.filename}`);

      const payloadValues = { title, description, price_eur, link: link || null };

      const created = await CatalogItem.create({
        owner: username,
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
 *  POST /api/catalog/item/:collectionId — ALIAS compatível com o front
 *  (aceita collectionId na URL e reutiliza a lógica acima)
 *  =========================== */
router.post(
  '/catalog/item/:collectionId',
  authenticateJWT,
  upload.array('images', 8),
  async (req: Request, res: Response) => {
    // Injeta o param no body e delega para a mesma lógica do endpoint original
    req.body.collectionId = req.params.collectionId;
    // Chama a rota original programaticamente: reaproveitamos a função acima
    // Para não duplicar código, colocamos a lógica aqui novamente (mais simples e explícito):

    try {
      const username = ensureAuthUser(req);
      if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

      const { collectionId } = req.params;
      if (!collectionId) return res.status(400).json({ error: 'collectionId é obrigatório.' });

      const col = await CatalogCollection.findOne({ _id: collectionId, owner: username }).lean();
      if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });

      // parse values
      let values: any = {};
      if (typeof req.body.values === 'string') {
        try { values = JSON.parse(req.body.values); }
        catch { return res.status(400).json({ error: 'Campo "values" deve ser um JSON válido.' }); }
      } else if (req.body.values && typeof req.body.values === 'object') {
        values = req.body.values;
      }

      // valida mínimos
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

      const base = process.env.BASE_URL || 'http://localhost:4000';
      const files = (req.files as Express.Multer.File[]) || [];
      const imageUrls = files.map((f) => `${base}/uploads/${f.filename}`);

      const payloadValues = { title, description, price_eur, link: link || null };

      const created = await CatalogItem.create({
        owner: username,
        collectionId,
        values: payloadValues,
        images: imageUrls,
      });

      return res.status(201).json(created);
    } catch (err: any) {
      console.error('[CATALOG] create item (by param) error:', err);
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
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { collectionId } = req.params;
    const col = await CatalogCollection.findOne({ _id: collectionId, owner: username }).lean();
    if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });

    const items = await CatalogItem.find({ owner: username, collectionId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(items);
  } catch (err) {
    console.error('[CATALOG] list items error:', err);
    return res.status(500).json({ error: 'Erro ao listar itens.' });
  }
});

/** GET /api/catalog/item/by-id/:itemId — obter um item do dono */
router.get('/catalog/item/by-id/:itemId', authenticateJWT, async (req, res) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { itemId } = req.params;
    const item = await CatalogItem.findOne({ _id: itemId, owner: username }).lean();
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });

    return res.status(200).json(item);
  } catch (err) {
    console.error('[CATALOG] get one item error:', err);
    return res.status(500).json({ error: 'Erro ao buscar item.' });
  }
});

/** PUT /api/catalog/item/:itemId — editar item (com upload opcional de novas imagens) */
router.put('/catalog/item/:itemId', authenticateJWT, upload.array('images', 8), async (req, res) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { itemId } = req.params;
    const existing = await CatalogItem.findOne({ _id: itemId, owner: username });
    if (!existing) return res.status(404).json({ error: 'Item não encontrado.' });

    // valores (title, description, price_eur, link)
    let values: any = {};
    if (typeof req.body.values === 'string') {
      try { values = JSON.parse(req.body.values); }
      catch { return res.status(400).json({ error: 'Campo "values" deve ser um JSON válido.' }); }
    } else if (req.body.values && typeof req.body.values === 'object') {
      values = req.body.values;
    }

    const patch: any = {};

    if (values.title !== undefined) {
      const title = String(values.title ?? '').trim();
      if (!title) return res.status(422).json({ error: 'Informe o nome do produto/serviço (title).' });
      patch['values.title'] = title;
    }
    if (values.description !== undefined) {
      const description = String(values.description ?? '').trim();
      if (!description) return res.status(422).json({ error: 'Informe a descrição.' });
      patch['values.description'] = description;
    }
    if (values.link !== undefined) {
      const link = values.link ? String(values.link).trim() : null;
      patch['values.link'] = link;
    }
    if (values.price_eur !== undefined) {
      if (values.price_eur === '' || values.price_eur === null) {
        patch['values.price_eur'] = null;
      } else {
        const n = Number(values.price_eur);
        if (!Number.isFinite(n) || n < 0) return res.status(422).json({ error: 'Preço inválido.' });
        patch['values.price_eur'] = n;
      }
    }

    // novas imagens
    const base = process.env.BASE_URL || 'http://localhost:4000';
    const files = (req.files as Express.Multer.File[]) || [];
    const newUrls = files.map((f) => `${base}/uploads/${f.filename}`);

    if (newUrls.length > 0) {
      if (String(req.query.replaceImages) === 'true') {
        // apaga antigas do disco (best-effort)
        try {
          const uploadsDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');
          for (const url of existing.images || []) {
            const idx = url.indexOf('/uploads/');
            if (idx >= 0) {
              const filename = url.slice(idx + '/uploads/'.length);
              const filePath = path.join(uploadsDir, filename);
              if (filePath.startsWith(uploadsDir)) fs.unlink(filePath, () => {});
            }
          }
        } catch {}
        patch['images'] = newUrls;
      } else {
        patch['images'] = [...(existing.images || []), ...newUrls];
      }
    }

    const updated = await CatalogItem.findByIdAndUpdate(itemId, patch, { new: true }).lean();
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[CATALOG] update item error:', err);
    return res.status(500).json({ error: 'Erro ao editar item.' });
  }
});

/** PUT /api/catalog/collection/:collectionId — renomear coleção */
router.put('/catalog/collection/:collectionId', authenticateJWT, async (req, res) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { collectionId } = req.params;
    const { title } = req.body;

    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Título é obrigatório.' });

    const col = await CatalogCollection.findOneAndUpdate(
      { _id: collectionId, owner: username },
      { $set: { title: String(title).trim() } },
      { new: true }
    ).lean();

    if (!col) return res.status(404).json({ error: 'Coleção não encontrada.' });
    return res.status(200).json(col);
  } catch (err) {
    console.error('[CATALOG] update collection error:', err);
    return res.status(500).json({ error: 'Erro ao editar coleção.' });
  }
});

/** DELETE /api/catalog/item/:itemId — apagar item do dono */
router.delete('/catalog/item/:itemId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = ensureAuthUser(req);
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { itemId } = req.params;

    const item = await CatalogItem.findOne({ _id: itemId, owner: username }).lean();
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });

    try {
      const uploadsDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');
      for (const url of item.images || []) {
        if (!url || typeof url !== 'string') continue;
        const idx = url.indexOf('/uploads/');
        if (idx >= 0) {
          const filename = url.slice(idx + '/uploads/'.length);
          const filePath = path.join(uploadsDir, filename);
          if (filePath.startsWith(uploadsDir)) fs.unlink(filePath, () => {});
        }
      }
    } catch (e) {
      console.warn('[CATALOG] falha ao apagar arquivos do item (seguindo mesmo assim):', e);
    }

    await CatalogItem.deleteOne({ _id: itemId, owner: username });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[CATALOG] delete item error:', err);
    return res.status(500).json({ error: 'Erro ao apagar item.' });
  }
});

// ✅ DELETE /api/catalog/collection/:id — igual padrão do produto (com force=true para apagar itens junto)
router.delete(
  '/catalog/collection/:id',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const username = ensureAuthUser(req);
      if (!username) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const { id } = req.params;
      const force = req.query.force === 'true';

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID de coleção inválido' });
      }

      // Coleção existe e é do usuário?
      const col = await CatalogCollection.findById(id);
      if (!col) return res.status(404).json({ error: 'Coleção não encontrado' });
      if (col.owner !== username) {
        return res.status(403).json({ error: 'Acesso não autorizado' });
      }

      // Verificar itens
      const items = await CatalogItem.find({ owner: username, collectionId: id });

      if (items.length > 0 && !force) {
        return res.status(409).json({
          error: 'Coleção possui itens. Remova os itens antes ou use ?force=true'
        });
      }

      // Se force=true → apagar imagens e itens
      if (items.length > 0 && force) {
        const uploadsDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

        for (const it of items) {
          for (const url of it.images || []) {
            const idx = url.indexOf('/uploads/');
            if (idx >= 0) {
              const filename = url.slice(idx + '/uploads/'.length);
              const filePath = path.join(uploadsDir, filename);
              if (filePath.startsWith(uploadsDir)) {
                fs.unlink(filePath, () => {});
              }
            }
          }
        }

        await CatalogItem.deleteMany({ owner: username, collectionId: id });
      }

      // Apagar coleção
      await col.deleteOne();
      return res.status(200).json({ message: 'Coleção deletada com sucesso' });

    } catch (error) {
      console.error('[CATALOG] delete error:', error);
      return res.status(500).json({ error: 'Erro interno ao deletar a coleção.' });
    }
  }
);

export default router;
