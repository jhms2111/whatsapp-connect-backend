// src/infraestructure/mongo/models/conversationQuotaModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IConversationQuota extends Document {
  username: string;

  totalConversations: number;  // alocadas para o período atual
  usedCharacters: number;      // usados no período atual
  packageType: number | null;
  lastStripeCheckoutId: string | null;

  // 🔹 NOVO: id da assinatura Stripe para WhatsApp
  stripeSubscriptionId?: string | null;

  coins?: number;              // moeda Enki
  coinsExpiresAt?: Date | null;

  // >>> CAMPOS DE VALIDADE DO PERÍODO (30 dias) <<<
  periodStart?: Date | null;
  periodEnd?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  // 👇 ADICIONAR (compat legada)
  usedConversations: number;
  creditEuros: number;
}

const ConversationQuotaSchema = new Schema<IConversationQuota>({
  username: { type: String, unique: true, index: true, required: true },

  totalConversations: { type: Number, default: 0 },
  usedCharacters: { type: Number, default: 0 },
  packageType: { type: Number, default: null },
  lastStripeCheckoutId: { type: String, default: null },

  // 🔹 NOVO: campo no Mongo para vincular à assinatura Stripe (WhatsApp)
  stripeSubscriptionId: { type: String, default: null },

  coins: { type: Number, default: 0 },
  coinsExpiresAt: { type: Date, default: null },

  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },

  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },

  // 👇 ADICIONAR: campos legados para parar de quebrar o TS
  usedConversations: { type: Number, default: 0 },
  creditEuros: { type: Number, default: 0 },
});

ConversationQuotaSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const ConversationQuota = mongoose.model<IConversationQuota>(
  'ConversationQuota',
  ConversationQuotaSchema
);

export default ConversationQuota;
