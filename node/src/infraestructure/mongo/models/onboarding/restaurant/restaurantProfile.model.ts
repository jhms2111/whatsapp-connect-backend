// backend/src/modules/onboarding/domains/restaurant/restaurantProfile.model.ts
// backend/src/modules/onboarding/domains/restaurant/restaurantProfile.model.ts

import mongoose, { Schema } from 'mongoose';

const restaurantProfileSchema = new Schema(
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

    restaurantName: {
      type: String,
      default: '',
    },

    subniche: {
      type: String,
      default: '',
    },

    description: {
      type: String,
      default: '',
    },

    location: {
      type: String,
      default: '',
    },

    openingHours: {
      type: String,
      default: '',
    },

    reservationPolicy: {
      type: String,
      default: '',
    },

    orderPolicy: {
      type: String,
      default: '',
    },

    preparationTime: {
      type: String,
      default: '',
    },

    paymentMethods: {
      type: [String],
      default: [],
    },

    mainDifferential: {
      type: String,
      default: '',
    },

    recommendationBehavior: {
      type: String,
      default: '',
    },

    restrictions: {
      type: String,
      default: '',
    },

    contactCapture: {
      type: [String],
      default: [],
    },

    agentStyle: {
      type: String,
      default: '',
    },

    acceptsReservations: {
      type: Boolean,
      default: false,
    },

    acceptsOrders: {
      type: Boolean,
      default: false,
    },

    acceptsDelivery: {
      type: Boolean,
      default: false,
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

export default mongoose.model('RestaurantProfile', restaurantProfileSchema);