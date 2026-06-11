import mongoose, { Schema } from 'mongoose';

const debtCollectionDebtorSchema = new Schema(
  {
    debtorName: { type: String, default: '' },
    documentReference: { type: String, default: '' },
    debtAmount: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    debtOrigin: { type: String, default: '' },

    paymentMethods: {
      type: [String],
      default: [],
    },

    maxInstallments: { type: String, default: '' },
    interestPolicy: { type: String, default: '' },
    discountPolicy: { type: String, default: '' },
    negotiationNotes: { type: String, default: '' },
    debtorEmail: { type: String, default: '' },
  },
  { _id: false }
);

const debtCollectionProfileSchema = new Schema(
  {
    owner: {
      type: String,
      required: true,
      index: true,
    },

    botId: {
      type: Schema.Types.ObjectId,
      ref: 'Bot',
      default: null,
      index: true,
    },

    companyName: {
      type: String,
      default: '',
    },

    businessType: {
      type: String,
      default: '',
    },

    debtTypes: {
      type: [String],
      default: [],
    },

    agentTone: {
      type: String,
      default: '',
    },

    approachStyle: {
      type: String,
      default: '',
    },

    negotiationGoal: {
      type: [String],
      default: [],
    },

    allowedNegotiation: {
      type: [String],
      default: [],
    },

    paymentMethods: {
      type: [String],
      default: [],
    },

    installmentsPolicy: {
      type: String,
      default: '',
    },

    interestPolicy: {
      type: String,
      default: '',
    },

    requiredData: {
      type: [String],
      default: [],
    },

    emailRequired: {
      type: String,
      default: '',
    },

    humanConfirmation: {
      type: String,
      default: '',
    },

    disputePolicy: {
      type: String,
      default: '',
    },

    forbiddenBehavior: {
      type: [String],
      default: [],
    },

    debtors: {
      type: [debtCollectionDebtorSchema],
      default: [],
    },

    rawProfile: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'DebtCollectionProfile',
  debtCollectionProfileSchema
);