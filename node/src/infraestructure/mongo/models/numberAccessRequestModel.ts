// src/infraestructure/mongo/models/numberAccessRequestModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export type NumberAccessStatus = 'submitted' | 'approved' | 'rejected';

export interface INumberAccessRequest extends Document {
  username: string;
  companyName: string;
  companyEmail: string;
  website?: string;
  description?: string;
  status: NumberAccessStatus;
  adminNotes?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<INumberAccessRequest>({
  username: { type: String, required: true, index: true },
  companyName: { type: String, required: true },
  companyEmail: { type: String, required: true },
  website: { type: String },
  description: { type: String },
  status: { type: String, enum: ['submitted', 'approved', 'rejected'], default: 'submitted', index: true },
  adminNotes: { type: String },
  decidedAt: { type: Date },
}, { timestamps: true });

schema.index({ username: 1, createdAt: -1 });

export default mongoose.model<INumberAccessRequest>('NumberAccessRequest', schema);
