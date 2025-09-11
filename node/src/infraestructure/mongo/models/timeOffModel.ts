import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITimeOff extends Document {
  owner: string;
  professional?: Types.ObjectId; // se ausente = fechamento da empresa
  date: Date;                    // dia afetado (normalizado p/ 00:00 local)
  startMin?: number;             // se ausente = dia todo
  endMin?: number;
  reason?: string;
}

const timeOffSchema = new Schema<ITimeOff>({
  owner: { type: String, required: true, index: true },
  professional: { type: Schema.Types.ObjectId, ref: 'Professional', index: true },
  date: { type: Date, required: true, index: true },
  startMin: { type: Number, min: 0, max: 24 * 60 },
  endMin: { type: Number, min: 0, max: 24 * 60 },
  reason: { type: String },
}, { timestamps: true });

timeOffSchema.index({ owner: 1, professional: 1, date: 1 });

export default mongoose.model<ITimeOff>('TimeOff', timeOffSchema);
