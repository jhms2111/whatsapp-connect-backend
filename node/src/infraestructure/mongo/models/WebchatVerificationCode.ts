import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebchatVerificationCode extends Document {
  username: string;
  phone: string;        // E.164
  codeHash: string;     // hash do código (não guardar o código em claro)
  expiresAt: Date;      // TTL
  attempts: number;     // tentativas feitas
}

const WebchatVerificationCodeSchema = new Schema<IWebchatVerificationCode>({
  username: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: '0s' } }, // TTL no Mongo
  attempts: { type: Number, required: true, default: 0 },
});

// índice único por (username, phone) ativo — opcional
WebchatVerificationCodeSchema.index({ username: 1, phone: 1 });

const WebchatVerificationCode: Model<IWebchatVerificationCode> =
  mongoose.models.WebchatVerificationCode || mongoose.model<IWebchatVerificationCode>('WebchatVerificationCode', WebchatVerificationCodeSchema);

export default WebchatVerificationCode;
