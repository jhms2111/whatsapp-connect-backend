// src/infraestructure/mongo/models/clienteModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICliente extends Document {
  username: string;
  status: 'active' | 'blocked';
  blockedAt?: Date | null;
  blockedReason?: string | null;

  // Controle global de bots
  botsEnabled: boolean;

  // ⚡ Follow-up (mensagem pós-conversa)
  followUpEnabled: boolean;           // se o follow-up está habilitado
  followUpMessage?: string | null;    // texto a enviar
  followUpDelayMinutes: number;       // atraso em minutos (ex.: 60)

  // Metadados
  createdAt?: Date;
  lastLogin?: Date | null;
}

const ClienteSchema = new Schema<ICliente>(
  {
    username: { type: String, unique: true, required: true, index: true },

    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
      index: true,
    },

    blockedAt: { type: Date, default: null },
    blockedReason: { type: String, default: null },

    // Controle global de bots
    botsEnabled: { type: Boolean, default: true },

    // ⚡ Follow-up
    followUpEnabled: { type: Boolean, default: false },
    followUpMessage: { type: String, default: null },
    followUpDelayMinutes: { type: Number, default: 60 },

    lastLogin: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);


ClienteSchema.index(
  { 'webchatTrial.phoneE164': 1 },
  { unique: true, partialFilterExpression: { 'webchatTrial.claimed': true } }
);


// Evita recompilar o model no hot-reload
export default mongoose.models.Cliente ||
  mongoose.model<ICliente>('Cliente', ClienteSchema);
