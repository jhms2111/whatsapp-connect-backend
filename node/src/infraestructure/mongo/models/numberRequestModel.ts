// src/infraestructure/mongo/models/numberRequestModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface INumberRequest extends Document {
  userId?: string;
  username: string;

  // Statuses: mantemos os antigos por compatibilidade,
  // mas o fluxo atual não usa mais "paid".
  status: 'pending_review' | 'paid' | 'approved' | 'rejected';

  selectedNumber?: string | null;

  createdAt: Date;
  updatedAt: Date;

  paidAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;

  // Legacy Stripe (compatibilidade)
  checkoutSessionId?: string | null;

  // Controle de brinde para evitar duplicidade
  freeTrialGrantedAt?: Date | null;

    adminNotes?: string | null;
}


const NumberRequestSchema = new Schema<INumberRequest>(
  {
    userId: { type: String },
    username: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['pending_review', 'paid', 'approved', 'rejected'],
      default: 'pending_review',
      index: true,
    },

    selectedNumber: { type: String, default: null },

    paidAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },

    checkoutSessionId: { type: String, default: null },

    freeTrialGrantedAt: { type: Date, default: null },

    // 👇 ADICIONAR:
    adminNotes: { type: String, default: null },
  },

  
  { timestamps: true }

  

  
);



export default mongoose.model<INumberRequest>('NumberRequest', NumberRequestSchema);
