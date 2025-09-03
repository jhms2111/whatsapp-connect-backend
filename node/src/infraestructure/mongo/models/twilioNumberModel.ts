// src/mongo/models/twilioNumberModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ITwilioNumber extends Document {
  owner: string;
  number: string;
}

const twilioNumberSchema = new Schema<ITwilioNumber>({
  owner: { type: String, required: true },
  number: { type: String, required: true, unique: true },
});

export default mongoose.model<ITwilioNumber>('TwilioNumber', twilioNumberSchema);
