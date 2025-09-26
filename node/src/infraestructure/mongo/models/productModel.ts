import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  // ===== Campos básicos =====
  id_external: string;       // id do cardápio (ex.: "pizza_04")
  category: string;          // ex.: "Pizza", "Antipasto"
  name: string;
  description: string;

  // ===== Preço =====
  price_eur: number | null;  // novo padrão
  price: number | null;      // legado / compatibilidade

  // ===== Imagem / dono =====
  imageUrl?: string;
  owner: string;

  // ===== Takeaway =====
  isTakeaway?: boolean;
  takeawayLink?: string;  

  // ===== Flags =====
  allergens: string[];
  contains_pork: boolean;
  spicy: boolean;
  vegetarian: boolean;
  vegan: boolean;
  pregnancy_unsuitable: boolean;

  // ===== Recomendações =====
  recommended_alcoholic?: string | null;
  recommended_non_alcoholic?: string | null;

  // ===== Notas livres =====
  notes?: string | null;
}

const productSchema = new Schema<IProduct>(
  {
    id_external: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    price_eur: { type: Number, default: null, min: 0 },
    price: { type: Number, default: null, min: 0 }, // legado

    imageUrl: { type: String },
    owner: { type: String, required: true, index: true },

    allergens: { type: [String], default: [] },
    contains_pork: { type: Boolean, default: false },
    spicy: { type: Boolean, default: false },
    vegetarian: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    pregnancy_unsuitable: { type: Boolean, default: false },

    recommended_alcoholic: { type: String, default: null },
    recommended_non_alcoholic: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

// regra takeaway
productSchema.pre('save', function (next) {
  const doc = this as IProduct;
  if (doc.isTakeaway && !doc.takeawayLink) {
    return next(new Error('takeawayLink é obrigatório quando isTakeaway=true'));
  }
  next();
});

// 🔎 índice de texto p/ busca eficiente
productSchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 5, description: 1 }, name: 'product_text_idx' }
);

const Product =
  mongoose.models.Product || mongoose.model<IProduct>('Product', productSchema);
export default Product;
