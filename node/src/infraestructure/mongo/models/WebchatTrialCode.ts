import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebchatTrialCode extends Document {
  username: string;
  phoneE164: string;
  code: string;
  expiresAt: Date;
  attempts: number;
}

const WebchatTrialCodeSchema = new Schema<IWebchatTrialCode>(
  {
    username: { type: String, required: true },
    phoneE164: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WebchatTrialCodeSchema.index({ username: 1, phoneE164: 1 }, { unique: true });

const WebchatTrialCode: Model<IWebchatTrialCode> =
  mongoose.models.WebchatTrialCode ||
  mongoose.model<IWebchatTrialCode>('WebchatTrialCode', WebchatTrialCodeSchema);

export default WebchatTrialCode;
