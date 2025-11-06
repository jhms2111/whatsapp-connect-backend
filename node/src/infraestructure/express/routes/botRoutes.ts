import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Bot from '../../mongo/models/botModel';
import Product from '../../mongo/models/productModel';
import CatalogItem from '../../mongo/models/catalogItemModel';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireActiveUser } from '../middleware/requireActiveUser';

const router = Router();

/** ===== Helpers ===== */
function pickStr(values: Record<string, any>, keys: string[], fallback = '') {
  for (const k of keys) {
    const v = values?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}
function pickNumNullable(values: Record<string, any>, keys: string[]): number | null {
  for (const k of keys) {
    const v = values?.[k];
    if (v === null || v === '' || v === undefined) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

type UpsertFromCatalogResult = { productId: mongoose.Types.ObjectId; created: boolean };

async function upsertProductFromCatalogItem(
  owner: string,
  catalogItem: any
): Promise<UpsertFromCatalogResult> {
  const v = (catalogItem?.values || {}) as Record<string, any>;
  const name = pickStr(v, ['title', 'name', 'nome', 'título', 'titulo'], `#${catalogItem?._id}`);
  const description = pickStr(v, ['description', 'descrição', 'descricao', 'descripcion'], '');
  const category = pickStr(v, ['category', 'categoria', 'tipo'], 'outros');
  const price_eur = pickNumNullable(v, ['price_eur', 'price', 'preço', 'preco']);

  const allergens = Array.isArray(v.allergens) ? v.allergens : [];
  const contains_pork = !!(v.contains_pork ?? v.porco);
  const spicy = !!(v.spicy ?? v.picante);
  const vegetarian = !!(v.vegetarian ?? v.vegetariano);
  const vegan = !!(v.vegan ?? v.vegano);
  const pregnancy_unsuitable = !!(v.pregnancy_unsuitable ?? v.gravidas_nao_recomendado);
  const recommended_alcoholic = typeof v.recommended_alcoholic === 'string' ? v.recommended_alcoholic : null;
  const recommended_non_alcoholic = typeof v.recommended_non_alcoholic === 'string' ? v.recommended_non_alcoholic : null;
  const notes = typeof v.notes === 'string' ? v.notes : null;

  const imageUrl =
    Array.isArray(catalogItem.images) && catalogItem.images.length
      ? catalogItem.images[0]
      : typeof v.image === 'string'
      ? v.image
      : undefined;

  const id_external = `catalog:${String(catalogItem._id)}`;

  const existing = await Product.findOne({ owner, id_external }).lean<{ _id: mongoose.Types.ObjectId }>();
  if (existing?._id) {
    await Product.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          name,
          description,
          category,
          price: price_eur,
          price_eur,
          allergens,
          contains_pork,
          spicy,
          vegetarian,
          vegan,
          pregnancy_unsuitable,
          recommended_alcoholic,
          recommended_non_alcoholic,
          notes,
          imageUrl,
          structured: {
            name,
            description,
            category,
            price_eur,
            allergens,
            contains_pork,
            spicy,
            vegetarian,
            vegan,
            pregnancy_unsuitable,
            recommended_alcoholic,
            recommended_non_alcoholic,
            notes,
            imageUrl,
            source: 'catalog-mirror',
          },
        },
      },
      { new: true }
    );
    return { productId: existing._id, created: false };
  }

  const created = await Product.create({
    owner,
    id_external,
    name,
    description,
    category,
    price: price_eur,
    price_eur,
    allergens,
    contains_pork,
    spicy,
    vegetarian,
    vegan,
    pregnancy_unsuitable,
    recommended_alcoholic,
    recommended_non_alcoholic,
    notes,
    imageUrl,
    structured: {
      name,
      description,
      category,
      price_eur,
      allergens,
      contains_pork,
      spicy,
      vegetarian,
      vegan,
      pregnancy_unsuitable,
      recommended_alcoholic,
      recommended_non_alcoholic,
      notes,
      imageUrl,
      source: 'catalog-mirror',
    },
  });

  return { productId: created._id, created: true };
}

async function mirrorCatalogItemsToProducts(owner: string, catalogItemIds: string[]): Promise<string[]> {
  if (!catalogItemIds?.length) return [];
  const docs = await CatalogItem.find({ _id: { $in: catalogItemIds }, owner }).lean();
  const idsByStr = new Set(catalogItemIds.map(String));
  const validDocs = docs.filter((d) => idsByStr.has(String(d._id)));

  const createdIds: string[] = [];
  for (const ci of validDocs) {
    const r = await upsertProductFromCatalogItem(owner, ci);
    createdIds.push(String(r.productId));
  }
  return createdIds;
}

/** Debug opcional */
router.get('/debug/bot-schema', (_req: Request, res: Response) => {
  const s = (Bot as any).schema;
  res.json({
    model: (Bot as any).modelName,
    productRequired: s.paths.product?.isRequired || false,
    hasCatalogItems: !!s.paths.catalogItems,
    paths: Object.keys(s.paths),
  });
});

/** Listar bots do usuário */
router.get('/bots', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const username = (req as any)?.user?.username;
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const bots = await Bot.find({ owner: username }).populate('product').populate('catalogItems').lean();
    return res.json(Array.isArray(bots) ? bots : []);
  } catch (err) {
    console.error('Erro ao listar bots:', err);
    return res.status(500).json({ error: 'Erro ao listar bots' });
  }
});

/** Obter 1 bot do usuário */
router.get('/bot/:id', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const username = (req as any)?.user?.username;
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const bot = await Bot.findOne({ _id: id, owner: username }).populate('product').populate('catalogItems').lean();
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });
    return res.json(bot);
  } catch (err) {
    console.error('Erro ao obter bot:', err);
    return res.status(500).json({ error: 'Erro ao obter bot' });
  }
});

/** Criar bot (v2) */
router.post('/bot-v2', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  const {
    persona,
    about,
    guidelines,
    temperature,
    product = [],
    catalogItems = [],
    companyName,
    address,
    email,
    phone,
  } = req.body;

  const username = (req as any)?.user?.username;
  if (!username) return res.status(401).json({ error: 'Usuário não autenticado.' });

  try {
    const existingBot = await Bot.findOne({ owner: username }).lean();
    if (existingBot) {
      return res.status(400).json({ error: 'Você já criou um bot. Edite ou exclua o existente.' });
    }

    const productArr: string[] = Array.isArray(product) ? product : [];
    const catalogArr: string[] = Array.isArray(catalogItems) ? catalogItems : [];

    if (productArr.length === 0 && catalogArr.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um produto OU um item do catálogo.' });
    }

    const t = Number(temperature);
    const safeTemp = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;

    const mirroredProductIds = await mirrorCatalogItemsToProducts(username, catalogArr);
    const finalProductIds = Array.from(new Set([...productArr.map(String), ...mirroredProductIds.map(String)]));

    const newBot = new Bot({
      name: 'Enki',
      persona: typeof persona === 'string' ? persona.trim() : undefined,
      about: typeof about === 'string' ? about.trim() : undefined,
      guidelines: typeof guidelines === 'string' ? guidelines.trim() : undefined,
      temperature: safeTemp,
      product: finalProductIds,
      catalogItems: catalogArr,
      companyName: typeof companyName === 'string' ? companyName.trim() : undefined,
      address: typeof address === 'string' ? address.trim() : undefined,
      email: typeof email === 'string' ? email.trim() : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      owner: username,
    });

    await newBot.save();

    const saved = await Bot.findById(newBot._id).populate('product').populate('catalogItems');
    return res.status(201).json(saved);
  } catch (error: any) {
    console.error('Erro ao criar bot v2:', error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: error.message || 'Dados inválidos.' });
    }
    return res.status(500).json({ error: error?.message || 'Erro ao criar o bot' });
  }
});

/** Editar bot */
router.put('/bot/edit/:id', authenticateJWT, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const username = (req as any)?.user?.username;
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID do bot inválido.' });

    const bot = await Bot.findOne({ _id: id, owner: username });
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado.' });

    const update: any = {};
    (['name', 'persona', 'about', 'guidelines', 'companyName', 'address', 'email', 'phone'] as const).forEach((f) => {
      if (req.body[f] !== undefined) update[f] = typeof req.body[f] === 'string' ? String(req.body[f]).trim() : req.body[f];
    });

    if (req.body.temperature !== undefined) {
      const t = Number(req.body.temperature);
      if (Number.isFinite(t)) update.temperature = Math.min(1, Math.max(0, t));
    }

    let nextProductIds: string[] =
      req.body.product !== undefined
        ? (Array.isArray(req.body.product) ? req.body.product.map(String) : [])
        : (Array.isArray((bot as any).product) ? (bot as any).product.map((p: any) => String(p)) : []);

    if (req.body.catalogItems !== undefined) {
      const catalogArr: string[] = Array.isArray(req.body.catalogItems) ? req.body.catalogItems.map(String) : [];
      update.catalogItems = catalogArr;
      const mirroredProductIds = await mirrorCatalogItemsToProducts(username, catalogArr);
      nextProductIds = Array.from(new Set([...(nextProductIds || []).map(String), ...mirroredProductIds.map(String)]));
    }

    if (nextProductIds) update.product = nextProductIds;

    const updated = await Bot.findByIdAndUpdate(id, update, { new: true }).populate('product').populate('catalogItems');
    return res.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar bot:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o bot' });
  }
});

export default router;
