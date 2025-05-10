import mongoose, { Document, Schema } from 'mongoose';

export interface IBot extends Document {
  name: string;
  persona: string;
  temperature: number;
  product: mongoose.Types.ObjectId[]; // agora é um array de produtos
  owner?: string;

  // Novos campos:
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
}

const botSchema = new Schema<IBot>({
  name: { type: String, required: true },
  persona: { type: String, required: true },
  temperature: { type: Number, default: 0.5 },
  product: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], // <-- agora é array
  companyName: { type: String },
  address: { type: String },
  email: { type: String },
  phone: { type: String },
  owner: { type: String }
});

export default mongoose.model<IBot>('Bot', botSchema);
