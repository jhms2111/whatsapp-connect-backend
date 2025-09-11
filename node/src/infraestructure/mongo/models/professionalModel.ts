import mongoose, { Schema, Document } from 'mongoose';

export interface IProfessional extends Document {
  owner: string;          // username do dono da conta
  name: string;
  skills: string[];       // tags de habilidades
  active: boolean;        // pode ou não receber agendamentos
  capacity: number;       // quantos atendimentos simultâneos por slot (geralmente 1)
}

const professionalSchema = new Schema<IProfessional>({
  owner: { type: String, required: true, index: true },
  name: { type: String, required: true },
  skills: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  capacity: { type: Number, default: 1, min: 1 },
}, { timestamps: true });

professionalSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model<IProfessional>('Professional', professionalSchema);
