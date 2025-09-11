import mongoose, { Schema, Document } from 'mongoose';

export interface IService extends Document {
  owner: string;
  name: string;
  description?: string;
  durationMin: number;           // duração do serviço (min)
  requiredSkills: string[];      // skills exigidas p/ executar
  priceMin?: number;
  priceMax?: number;
  bufferBeforeMin?: number;      // tempo de preparação
  bufferAfterMin?: number;       // tempo de limpeza
  active: boolean;
}

const serviceSchema = new Schema<IService>({
  owner: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String },
  durationMin: { type: Number, required: true, min: 5 },
  requiredSkills: { type: [String], default: [] },
  priceMin: Number,
  priceMax: Number,
  bufferBeforeMin: { type: Number, default: 0, min: 0 },
  bufferAfterMin: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

serviceSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model<IService>('Service', serviceSchema);
