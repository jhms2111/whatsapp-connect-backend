import mongoose, { Schema, Document } from 'mongoose';

export interface ITwilioInventory extends Document {
  number: string;          // E.164 com 'whatsapp:+...' se preferir manter padrão
  label?: string;
  assignedTo?: string;     // userId/username
  active: boolean;         // true = disponível p/ associar
}

const twilioInventorySchema = new Schema<ITwilioInventory>({
  number: { type: String, required: true, unique: true, index: true },
  label: { type: String },
  assignedTo: { type: String, index: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export default mongoose.model<ITwilioInventory>('TwilioInventory', twilioInventorySchema);
