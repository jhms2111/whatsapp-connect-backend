//onboardingDraftModel.ts


import mongoose, { Schema } from 'mongoose';

const onboardingAnswerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    section: { type: String, default: '' },

    language: {
      type: String,
      enum: ['pt', 'es', 'en'],
      default: 'pt',
    },

    question: { type: String, required: true },
    answer: { type: String, default: '' },

    rawValue: { type: Schema.Types.Mixed },
    normalizedValue: { type: Schema.Types.Mixed },

    answerType: {
      type: String,
      enum: [
        'single_choice',
        'multi_choice',
        'text',
        'textarea',
        'number',
        'boolean',
      ],
      default: 'text',
    },

    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const onboardingProductSchema = new Schema(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    price: { type: Schema.Types.Mixed, default: '' },
    link: { type: String, default: '' },
  },
  { _id: false }
);

const onboardingDebtorSchema = new Schema(
  {
    debtorName: { type: String, default: '' },
    documentReference: { type: String, default: '' },
    debtAmount: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    debtOrigin: { type: String, default: '' },
    paymentMethods: [{ type: String }],
    maxInstallments: { type: String, default: '' },
    interestPolicy: { type: String, default: '' },
    discountPolicy: { type: String, default: '' },
    negotiationNotes: { type: String, default: '' },
    debtorEmail: { type: String, default: '' },
  },
  { _id: false }
);

const onboardingSessionSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['draft', 'pending_email', 'completed', 'expired', 'cancelled'],
      default: 'draft',
      index: true,
    },

    language: {
      type: String,
      enum: ['pt', 'es', 'en'],
      default: 'pt',
    },

    domain: {
      type: String,
      default: '',
      index: true,
    },

    taxonomy: {
      mainCategory: { type: String, default: '' },
      subniche: { type: String, default: '' },
      services: [{ type: String }],
      modules: [{ type: String }],
    },

    answers: {
      type: [onboardingAnswerSchema],
      default: [],
    },

    answersMap: {
      type: Schema.Types.Mixed,
      default: {},
    },

    domainProfile: {
      type: Schema.Types.Mixed,
      default: {},
    },

    llmContext: {
      language: {
        type: String,
        enum: ['pt', 'es', 'en'],
        default: 'pt',
      },
      summary: { type: String, default: '' },
      structured: {
        type: Schema.Types.Mixed,
        default: {},
      },
      questionAnswerText: { type: String, default: '' },
    },

    products: {
      type: [onboardingProductSchema],
      default: [],
    },

    debtors: {
      type: [onboardingDebtorSchema],
      default: [],
    },

    account: {
      businessName: { type: String, default: '' },
      email: { type: String, default: '', index: true },
      phone: { type: String, default: '' },
    },

    userEmail: {
      type: String,
      default: '',
      index: true,
    },

    username: {
      type: String,
      default: '',
      index: true,
    },

    emailVerificationCodeHash: {
      type: String,
      default: '',
    },

    emailVerificationCodeExpiry: {
      type: Date,
      default: null,
    },

    emailVerificationAttempts: {
      type: Number,
      default: 0,
    },

    createdBotId: {
      type: Schema.Types.ObjectId,
      ref: 'Bot',
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('OnboardingSession', onboardingSessionSchema);