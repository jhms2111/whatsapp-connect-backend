// src/infraestructure/mongo/models/onboardingDraftModel.ts
import mongoose from 'mongoose';

const OnboardingDraftSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },

    answers: { type: Object, required: true },
    products: { type: Array, default: [] },
    account: { type: Object, required: true },

    status: {
      type: String,
      enum: ['pending_email', 'completed', 'expired'],
      default: 'pending_email',
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model('OnboardingDraft', OnboardingDraftSchema);