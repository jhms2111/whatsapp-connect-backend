import mongoose, { Schema, Document } from 'mongoose';

export interface IBot extends Document {
  name: string;
  persona: string;
  about?: string;
  guidelines?: string;
  temperature: number;
  product: mongoose.Types.ObjectId[];
  catalogItems?: mongoose.Types.ObjectId[];
  owner: string;
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
}

const botSchema = new Schema<IBot>(
  {
    name: { type: String, required: true },
    persona: { type: String, required: true },
    about: { type: String },
    guidelines: { type: String },
    temperature: { type: Number, default: 0.5 },

    // ❗ sem "required: true"
    product: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    catalogItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CatalogItem' }],

    companyName: { type: String },
    address: { type: String },
    email: { type: String },
    phone: { type: String },
    owner: { type: String, required: true },
  },
  { timestamps: true }
);

// precisa ter ao menos 1 entre product OU catalogItems
botSchema.pre('validate', function (next) {
  const p = Array.isArray((this as any).product) ? (this as any).product : [];
  const c = Array.isArray((this as any).catalogItems) ? (this as any).catalogItems : [];
  if (p.length === 0 && c.length === 0) {
    return next(
      new mongoose.Error.ValidationError(new Error('Selecione ao menos um produto OU um item do catálogo.'))
    );
  }
  next();
});

export default mongoose.models.Bot || mongoose.model<IBot>('Bot', botSchema);


