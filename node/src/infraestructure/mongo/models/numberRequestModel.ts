import mongoose, { Schema, Document, Types } from 'mongoose';

export type NumberRequestStatus = 'pending_review' | 'paid' | 'approved' | 'rejected';

export interface INumberRequest extends Document {
  userId: string;               // ou o username, se preferir
  username: string;             // redundância útil p/ listagens
  status: NumberRequestStatus;
  checkoutSessionId?: string;   // para quando reintroduzir Stripe
  adminNotes?: string;
  selectedNumber?: string;      // número aprovado pelo admin
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
}

const numberRequestSchema = new Schema<INumberRequest>({
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending_review','paid','approved','rejected'], default: 'pending_review', index: true },
  checkoutSessionId: { type: String },
  adminNotes: { type: String },
  selectedNumber: { type: String },
  paidAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
}, { timestamps: true });

numberRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model<INumberRequest>('NumberRequest', numberRequestSchema);
