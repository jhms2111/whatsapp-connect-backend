import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IClientMemory extends Document {
  clientId: string;
  name?: string;
  age?: number;
  city?: string;
  contact?: {
    email?: string;
    phone?: string;
  };
  lastInteraction?: Date;
  lastPurchase?: {
    product: string;
    date: string;
  };
  // agregados leves para contexto rápido
  topicsAgg?: string[];
  sentimentAgg?: 'positive' | 'neutral' | 'negative';
  interactions: {
    sender: 'client' | 'bot';
    message: string;
    timestamp: Date;
    topics?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    appointmentId?: Types.ObjectId;
  }[];
}

const ClientMemorySchema = new Schema<IClientMemory>({
  clientId: { type: String, required: true, index: true },
  name: String,
  age: Number,
  city: String,
  contact: {
    email: String,
    phone: String,
  },
  lastInteraction: Date,
  lastPurchase: {
    product: String,
    date: String,
  },
  topicsAgg: { type: [String], default: [] },
  sentimentAgg: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  interactions: [
    {
      sender: { type: String, enum: ['client', 'bot'], required: true },
      message: { type: String, required: true },
      timestamp: { type: Date, default: Date.now, index: true },
      topics: [String],
      sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
      appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    },
  ],
}, { timestamps: true });

// cap suave via middleware (mantém últimas 500 interações)
ClientMemorySchema.pre('save', function (next) {
  const self = this as IClientMemory;
  if (self.interactions && self.interactions.length > 500) {
    self.interactions = self.interactions.slice(self.interactions.length - 500);
  }
  next();
});

const ClientMemory = mongoose.model<IClientMemory>('ClientMemory', ClientMemorySchema);
export default ClientMemory;
