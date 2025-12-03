import mongoose, { Schema, Document } from 'mongoose';

export interface IConversationQuota extends Document {
  username: string;

  totalConversations: number;  // alocadas para o período atual
  usedCharacters: number;      // usados no período atual
  packageType: number | null;
  lastStripeCheckoutId: string | null;

  // id da assinatura Stripe para WhatsApp (sub_...)
  stripeSubscriptionId?: string | null;

  coins?: number;              // moeda Enki
  coinsExpiresAt?: Date | null;

  // validade do período (ex: 30 dias)
  periodStart?: Date | null;
  periodEnd?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  // campos legados
  usedConversations: number;
  creditEuros: number;
}

const ConversationQuotaSchema = new Schema<IConversationQuota>({
  username: { type: String, unique: true, index: true, required: true },

  totalConversations: { type: Number, default: 0 },
  usedCharacters: { type: Number, default: 0 },
  packageType: { type: Number, default: null },
  lastStripeCheckoutId: { type: String, default: null },

  // vincula à assinatura Stripe (WhatsApp)
  stripeSubscriptionId: { type: String, default: null },

  coins: { type: Number, default: 0 },
  coinsExpiresAt: { type: Date, default: null },

  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },

  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },

  // compat/legado
  usedConversations: { type: Number, default: 0 },
  creditEuros: { type: Number, default: 0 },
});

ConversationQuotaSchema.pre('save', function (next) {
  (this as any).updatedAt = new Date();
  next();
});

const ConversationQuota = mongoose.models.ConversationQuota
  || mongoose.model<IConversationQuota>('ConversationQuota', ConversationQuotaSchema);

export default ConversationQuota;
