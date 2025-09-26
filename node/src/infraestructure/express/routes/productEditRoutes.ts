import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../../mongo/models/productModel';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

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

function parseBoolean(v: any): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function ensureString(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  return v.toString().trim();
}

function ensureNullableString(v: any): string | null | undefined {
  if (v === undefined) return undefined;
  const s = (v ?? '').toString().trim();
  return s.length ? s : null;
}

function parsePriceNullable(v: any): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '' || v === 'null') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('price_eur inválido');
  return n;
}

function validateAllergens(list: any): string[] | undefined {
  if (list === undefined) return undefined;
  if (list === null) return [];
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

function assertCoherence(partial: {
  vegan?: boolean;
  vegetarian?: boolean;
  contains_pork?: boolean;
  allergens?: string[];
}) {
  if (partial.vegan === true && partial.allergens) {
    if (partial.allergens.includes('lacteos') || partial.allergens.includes('huevo')) {
      throw new Error('Item vegano não pode conter lácteos/ovos.');
    }
  }
  if (partial.vegetarian === true && partial.contains_pork === true) {
    throw new Error('Item vegetariano não pode conter porco.');
  }
}

/** ===========================
 *  PUT /api/product/:id — edita produto do dono (novo padrão)
 *  =========================== */
router.put(
  '/product/:id',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as { username: string };
      if (!user?.username) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID de produto inválido' });
      }

      const prod = await Product.findById(id);
      if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
      if (prod.owner !== user.username) {
        return res.status(403).json({ error: 'Acesso não autorizado' });
      }

      /** Aceita dois formatos no body:
       *  1) Novo padrão diretamente (campos planos)
       *  2) Campo "structured" com o JSON do novo padrão (útil em multipart)
       *  + Campos legados (name/description/price) continuam aceitos.
       */
      let body: any = req.body;
      if (typeof body.structured === 'string') {
        try {
          body = JSON.parse(body.structured);
        } catch {
          return res.status(400).json({ error: 'Campo "structured" não é um JSON válido.' });
        }
      }

      // Atualização parcial no novo padrão:
      const updateStructured: any = {};

      // Campos do padrão estruturado
      const id_external = ensureString(body.id);
      if (id_external !== undefined) updateStructured.id_external = id_external;

      const category = ensureString(body.category);
      if (category !== undefined) updateStructured.category = category;

      const nameNew = ensureString(body.name);
      if (nameNew !== undefined) {
        updateStructured.name = nameNew;     // para compatibilidade antiga
        updateStructured['structured.name'] = nameNew;
      }

      const descriptionNew = ensureString(body.description);
      if (descriptionNew !== undefined) {
        updateStructured.description = descriptionNew; // compat.
        updateStructured['structured.description'] = descriptionNew;
      }

      const priceEur = parsePriceNullable(body.price_eur);
      if (priceEur !== undefined) {
        // Campo legado "price" é mantido refletindo price_eur.
        updateStructured.price = priceEur ?? null;
        updateStructured.price_eur = priceEur;
      }

      const allergens = validateAllergens(body.allergens);
      if (allergens !== undefined) updateStructured.allergens = allergens;

      const contains_pork = parseBoolean(body.contains_pork);
      if (contains_pork !== undefined) updateStructured.contains_pork = contains_pork;

      const spicy = parseBoolean(body.spicy);
      if (spicy !== undefined) updateStructured.spicy = spicy;

      const vegetarian = parseBoolean(body.vegetarian);
      if (vegetarian !== undefined) updateStructured.vegetarian = vegetarian;

      const vegan = parseBoolean(body.vegan);
      if (vegan !== undefined) updateStructured.vegan = vegan;

      const pregnancy_unsuitable = parseBoolean(body.pregnancy_unsuitable);
      if (pregnancy_unsuitable !== undefined)
        updateStructured.pregnancy_unsuitable = pregnancy_unsuitable;

      const rec_alc = ensureNullableString(body.recommended_alcoholic);
      if (rec_alc !== undefined) updateStructured.recommended_alcoholic = rec_alc;

      const rec_nonalc = ensureNullableString(body.recommended_non_alcoholic);
      if (rec_nonalc !== undefined) updateStructured.recommended_non_alcoholic = rec_nonalc;

      const notes = ensureNullableString(body.notes);
      if (notes !== undefined) updateStructured.notes = notes;

      // Campos legados (se enviados) — continuam funcionando:
      const legacyName = ensureString(req.body.name);
      if (legacyName !== undefined) updateStructured.name = legacyName;

      const legacyDesc = ensureString(req.body.description);
      if (legacyDesc !== undefined) updateStructured.description = legacyDesc;

      if (req.body.price !== undefined) {
        const n = Number(req.body.price);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(422).json({ error: 'price inválido' });
        }
        updateStructured.price = n;
        updateStructured.price_eur = n;
      }

      // Takeaway (compatibilidade com app atual)
      const isTakeaway = parseBoolean(req.body.isTakeaway);
      if (isTakeaway !== undefined) updateStructured.isTakeaway = isTakeaway;

      // Regras para takeawayLink
      const incomingTakeawayLink = ensureString(req.body.takeawayLink);
      if (isTakeaway === false) {
        updateStructured.takeawayLink = undefined;
      } else if (isTakeaway === true) {
        const existingLink = prod.takeawayLink;
        if (!incomingTakeawayLink && !existingLink) {
          return res
            .status(422)
            .json({ error: 'takeawayLink é obrigatório quando isTakeaway=true' });
        }
        if (incomingTakeawayLink !== undefined) updateStructured.takeawayLink = incomingTakeawayLink;
      }

      // Imagem (URL já hospedada)
      const imageUrl = ensureString(req.body.imageUrl);
      if (imageUrl !== undefined) updateStructured.imageUrl = imageUrl;

      // Checagens de coerência (somente sobre os campos enviados)
      assertCoherence({
        vegan,
        vegetarian,
        contains_pork,
        allergens,
      });

      // Persistência
      const updated = await Product.findByIdAndUpdate(id, updateStructured, {
        new: true,
      });

      return res.status(200).json(updated);
    } catch (error: any) {
      console.error('[PRODUCT] edit error:', error);
      const msg =
        error?.message?.includes('alergeno inválido') ||
        error?.message?.includes('price_eur inválido') ||
        error?.message?.includes('vegano') ||
        error?.message?.includes('vegetariano')
          ? error.message
          : 'Erro interno ao editar o produto.';
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
