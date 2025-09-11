import mongoose, { Schema, Document } from 'mongoose';

export interface IAvailabilityWindow {
  dayOfWeek: number;      // 0=Domingo ... 6=Sábado
  startMin: number;       // ex.: 8*60 = 480
  endMin: number;         // ex.: 12*60 = 720
}

export interface IAvailabilityTemplate extends Document {
  owner: string;
  name: string;
  timezone: string;       // ex.: 'America/Sao_Paulo'
  windows: IAvailabilityWindow[]; // múltiplas faixas/dia
}

const windowSchema = new Schema<IAvailabilityWindow>({
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startMin: { type: Number, min: 0, max: 24 * 60, required: true },
  endMin: { type: Number, min: 0, max: 24 * 60, required: true },
}, { _id: false });

const availabilityTemplateSchema = new Schema<IAvailabilityTemplate>({
  owner: { type: String, required: true, index: true },
  name: { type: String, required: true },
  timezone: { type: String, required: true },
  windows: { type: [windowSchema], default: [] },
}, { timestamps: true });

availabilityTemplateSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model<IAvailabilityTemplate>('AvailabilityTemplate', availabilityTemplateSchema);
