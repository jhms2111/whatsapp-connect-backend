// src/infraestructure/mongo/models/botModel.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IBot extends Document {
  name: string;
  persona: string;
  about?: string;                 // ✅ "Quem somos"
  temperature: number;
  product: mongoose.Types.ObjectId[];
  owner: string;
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
}

const botSchema = new Schema<IBot>({
  name: { type: String, required: true },
  persona: { type: String, required: true },
  about: { type: String },        // ✅ novo campo
  temperature: { type: Number, default: 0.5 },
  product: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  companyName: { type: String },
  address: { type: String },
  email: { type: String },
  phone: { type: String },
  owner: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model<IBot>('Bot', botSchema);
