// src/infraestructure/mongo/models/webchatTrialPhoneModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IWebchatTrialPhone extends Document {
  phoneE164: string;     // +346XXXXXXXX
  username: string;      // quem usou
  claimedAt: Date;       // quando foi concedido o trial
}

const WebchatTrialPhoneSchema = new Schema<IWebchatTrialPhone>({
  phoneE164: { type: String, required: true, index: true, unique: true },
  username:  { type: String, required: true, index: true },
  claimedAt: { type: Date,   required: true },
}, { timestamps: true });

// Evita recompilar em dev/hot-reload
const WebchatTrialPhone =
  mongoose.models.WebchatTrialPhone ||
  mongoose.model<IWebchatTrialPhone>('WebchatTrialPhone', WebchatTrialPhoneSchema);

export default WebchatTrialPhone;
