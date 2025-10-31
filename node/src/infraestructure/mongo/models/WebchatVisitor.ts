import mongoose, { Schema, Document } from 'mongoose';

export interface IWebchatVisitor extends Document {
  owner: string;           // username do dono do bot
  phoneE164: string;       // +5511999999999
  otpCode?: string | null; // último código gerado (não armazene em prod por muito tempo)
  otpExpiresAt?: Date | null;
  verifiedAt?: Date | null;
  visitorTokenVersion: number;

  // Sessão (sala fixa)
  sessionId: string;       // ex: hash/uuid opcional (não precisa se usar roomId direto)
  roomId: string;          // "webchat:<owner>:<phoneE164>"

  createdAt: Date;
  updatedAt: Date;
}

const WebchatVisitorSchema = new Schema<IWebchatVisitor>({
  owner: { type: String, index: true, required: true },
  phoneE164: { type: String, index: true, required: true },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  visitorTokenVersion: { type: Number, default: 1 },

  sessionId: { type: String, required: true },
  roomId: { type: String, unique: true, required: true },

  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

WebchatVisitorSchema.index({ owner: 1, phoneE164: 1 }, { unique: true });

WebchatVisitorSchema.pre('save', function (next) {
  (this as any).updatedAt = new Date();
  next();
});

const WebchatVisitor =
  mongoose.models.WebchatVisitor ||
  mongoose.model<IWebchatVisitor>('WebchatVisitor', WebchatVisitorSchema);

export default WebchatVisitor;
