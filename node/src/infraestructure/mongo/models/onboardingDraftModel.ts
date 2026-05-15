import mongoose from 'mongoose';

const OnboardingDraftSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },

    businessType: { type: String, default: '' },

    answers: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },

    normalizedAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    products: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    account: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },

    status: {
      type: String,
      enum: ['pending_email', 'completed', 'expired'],
      default: 'pending_email',
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

OnboardingDraftSchema.index({ email: 1, status: 1 });

export default mongoose.model('OnboardingDraft', OnboardingDraftSchema);