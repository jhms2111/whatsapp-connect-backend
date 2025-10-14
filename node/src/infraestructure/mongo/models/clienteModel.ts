// src/infraestructure/mongo/models/clienteModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICliente extends Document {
  username: string;
  createdAt: Date;
  lastLogin?: Date;
  status?: 'active' | 'blocked';
  blockedAt?: Date | null;
  blockedReason?: string | null;
}

const clienteSchema = new Schema<ICliente>({
  username: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true },
  lastLogin: { type: Date },
  status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
  blockedAt: { type: Date, default: null },
  blockedReason: { type: String, default: null },
});

export default mongoose.model<ICliente>('Cliente', clienteSchema);
