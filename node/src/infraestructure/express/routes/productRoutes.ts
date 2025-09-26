import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Product from '../../mongo/models/productModel';
import { authenticateJWT } from '../middleware/authMiddleware';

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
 *  Helpers / Validação
 *  =========================== */
const VALID_ALLERGENS = new Set([
  'gluten',
  'lacteos',
  'huevo',
  'pescado',
  'frutos_secos',
  'soja',
  'mostaza',
  'apio',
]);

type StructuredProduct = {
  id: string;
  category: string;
  name: string;
  description: string;
  price_eur: number | null;
  allergens: string[];
  contains_pork: boolean;
  spicy: boolean;
  vegetarian: boolean;
  vegan: boolean;
  pregnancy_unsuitable: boolean;
  recommended_alcoholic: string | null;
  recommended_non_alcoholic: string | null;
  notes: string | null;
};

function parseBoolean(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

function ensureString(v: any): string {
  return (v ?? '').toString().trim();
}

function ensureNullableString(v: any): string | null {
  const s = (v ?? '').toString().trim();
  return s.length ? s : null;
}

function parsePriceNullable(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  throw new Error('price_eur inválido');
}

function validateAllergens(list: any): string[] {
  if (list == null) return [];
  const arr = Array.isArray(list) ? list : [list];
  const cleaned = Array.from(
    new Set(
      arr
        .map((x) => x?.toString().trim())
        .filter((x) => x)
    )
  );
  for (const a of cleaned) {
    if (!VALID_ALLERGENS.has(a)) {
      throw new Error(
        `alergeno inválido: "${a}". Válidos: ${Array.from(VALID_ALLERGENS).join(', ')}`
      );
    }
  }
  return cleaned;
}

/** ===========================
 *  POST /api/product — cria produto (padrão estruturado)
 *  =========================== */
router.post(
  '/product',
  authenticateJWT,
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as { username: string };
      if (!user?.username) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      // Permite multipart/form-data: se vier um campo "structured" JSON, usamos;
      // senão tentamos montar a partir dos campos individuais já no novo padrão.
      let body: any = req.body;
      if (typeof body.structured === 'string') {
        try {
          body = JSON.parse(body.structured);
        } catch {
          return res.status(400).json({ error: 'Campo "structured" não é um JSON válido.' });
        }
      }

      // Também aceitamos o formato antigo por compatibilidade, mas recomendamos o novo.
      const isLegacy =
        body && body.name && body.description && (body.price !== undefined || body.price_eur !== undefined) && !body.id;

      let payload: StructuredProduct;

      if (isLegacy) {
        // Mapeamento básico do antigo -> novo
        payload = {
          id: `${Date.now()}`, // gera um id simples se não vier
          category: ensureString(body.category || 'Outro'),
          name: ensureString(body.name),
          description: ensureString(body.description),
          price_eur:
            body.price_eur !== undefined ? parsePriceNullable(body.price_eur) : parsePriceNullable(body.price),
          allergens: validateAllergens(body.allergens || []),
          contains_pork: parseBoolean(body.contains_pork),
          spicy: parseBoolean(body.spicy),
          vegetarian: parseBoolean(body.vegetarian),
          vegan: parseBoolean(body.vegan),
          pregnancy_unsuitable: parseBoolean(body.pregnancy_unsuitable),
          recommended_alcoholic: ensureNullableString(body.recommended_alcoholic),
          recommended_non_alcoholic: ensureNullableString(body.recommended_non_alcoholic),
          notes: ensureNullableString(body.notes),
        };
      } else {
        // Novo padrão (recomendado)
        const id = ensureString(body.id);
        const category = ensureString(body.category);
        const name = ensureString(body.name);
        const description = ensureString(body.description);

        if (!id || !category || !name || !description) {
          return res.status(400).json({
            error:
              'Campos obrigatórios faltando: id, category, name, description.',
          });
        }

        payload = {
          id,
          category,
          name,
          description,
          price_eur: parsePriceNullable(body.price_eur),
          allergens: validateAllergens(body.allergens),
          contains_pork: parseBoolean(body.contains_pork),
          spicy: parseBoolean(body.spicy),
          vegetarian: parseBoolean(body.vegetarian),
          vegan: parseBoolean(body.vegan),
          pregnancy_unsuitable: parseBoolean(body.pregnancy_unsuitable),
          recommended_alcoholic: ensureNullableString(body.recommended_alcoholic),
          recommended_non_alcoholic: ensureNullableString(body.recommended_non_alcoholic),
          notes: ensureNullableString(body.notes),
        };
      }

      // Regras adicionais
      if (payload.vegan && (payload.allergens.includes('lacteos') || payload.allergens.includes('huevo'))) {
        return res.status(422).json({ error: 'Item vegano não pode conter lácteos/ovos.' });
      }
      if (payload.vegetarian && payload.contains_pork) {
        return res.status(422).json({ error: 'Item vegetariano não pode conter porco.' });
      }

      // URL de imagem, se enviada
      const file = req.file;
      const imageUrl = file
        ? `${process.env.BASE_URL || 'http://localhost:4000'}/uploads/${file.filename}`
        : undefined;



      // Documento para o Mongo.
      // Observação: se o Schema do Product for estrito, garanta que ele tenha esses campos.
      const created = await Product.create({
        // campos “legados” para manter compatibilidade com qualquer UI existente
        name: payload.name,
        description: payload.description,
        price: payload.price_eur ?? null,
        imageUrl,

        // dono
        owner: user.username,



        // ===== Novo padrão estruturado =====
        id_external: payload.id, // se preferir, renomeie no schema
        category: payload.category,
        price_eur: payload.price_eur,
        allergens: payload.allergens,
        contains_pork: payload.contains_pork,
        spicy: payload.spicy,
        vegetarian: payload.vegetarian,
        vegan: payload.vegan,
        pregnancy_unsuitable: payload.pregnancy_unsuitable,
        recommended_alcoholic: payload.recommended_alcoholic,
        recommended_non_alcoholic: payload.recommended_non_alcoholic,
        notes: payload.notes,
        // cópia crua para consultas flexíveis / futura compatibilidade
        structured: payload,
      });

      return res.status(201).json(created);
    } catch (error: any) {
      console.error('[PRODUCT] create error:', error);
      const msg =
        error?.message?.includes('alergeno inválido') ||
        error?.message?.includes('price_eur inválido')
          ? error.message
          : 'Erro interno ao criar produto.';
      return res.status(500).json({ error: msg });
    }
  }
);

/** ===========================
 *  GET /api/products — lista produtos do usuário
 *  =========================== */
router.get('/products', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { username: string };
    if (!user?.username) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const products = await Product.find({ owner: user.username }).sort({
      createdAt: -1,
    });

    return res.status(200).json(products);
  } catch (error) {
    console.error('[PRODUCT] list error:', error);
    return res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

export default router;
