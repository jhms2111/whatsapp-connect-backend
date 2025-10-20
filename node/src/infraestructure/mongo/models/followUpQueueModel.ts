// src/infraestructure/mongo/models/followUpQueueModel.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFollowUpSchedule extends Document {
  ownerUsername: string; // dono do número Twilio
  from: string;          // número do cliente final (ex.: "whatsapp:+55119...")
  to: string;            // número Twilio (ex.: "whatsapp:+1415...")
  scheduledAt: Date;     // quando deve disparar
  sent: boolean;         // já disparou?
  sentAt?: Date | null;  // quando disparou
  createdAt?: Date;
  updatedAt?: Date;
}

const FollowUpScheduleSchema = new Schema<IFollowUpSchedule>(
  {
    ownerUsername: { type: String, required: true, index: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    scheduledAt: { type: Date, required: true, index: true },
    sent: { type: Boolean, default: false, index: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 1 documento PENDENTE (sent:false) por conversa (owner+from+to)
FollowUpScheduleSchema.index(
  { ownerUsername: 1, from: 1, to: 1, sent: 1 },
  { unique: true, partialFilterExpression: { sent: false } }
);

const FollowUpSchedule: Model<IFollowUpSchedule> =
  mongoose.models.FollowUpSchedule ||
  mongoose.model<IFollowUpSchedule>('FollowUpSchedule', FollowUpScheduleSchema);

export default FollowUpSchedule;
