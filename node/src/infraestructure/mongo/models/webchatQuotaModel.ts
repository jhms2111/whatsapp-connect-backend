import mongoose, { Schema, Document } from 'mongoose';

export interface IWebchatQuota extends Document {
  username: string;

  totalConversations: number;  // alocadas para o período atual (WebChat)
  usedCharacters: number;      // usados no período atual (WebChat)
  packageType: number | null;  // 19/39/79... conforme pacotes WebChat
  lastStripeCheckoutId: string | null;

  coins?: number;              // opcional, se quiser “moeda” de WebChat
  coinsExpiresAt?: Date | null;

  periodStart?: Date | null;
  periodEnd?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const WebchatQuotaSchema = new Schema<IWebchatQuota>({
  username: { type: String, unique: true, index: true, required: true },

  totalConversations: { type: Number, default: 0 },
  usedCharacters: { type: Number, default: 0 },
  packageType: { type: Number, default: null },
  lastStripeCheckoutId: { type: String, default: null },

  coins: { type: Number, default: 0 },
  coinsExpiresAt: { type: Date, default: null },

  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },

  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

WebchatQuotaSchema.pre('save', function (next) {
  (this as any).updatedAt = new Date();
  next();
});

const WebchatQuota =
  mongoose.models.WebchatQuota ||
  mongoose.model<IWebchatQuota>('WebchatQuota', WebchatQuotaSchema);

export default WebchatQuota;
