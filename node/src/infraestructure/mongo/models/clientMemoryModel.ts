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
  interactions: {
    sender: 'client' | 'bot';
    message: string;
    timestamp: Date;
    topics?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    appointmentId?: Types.ObjectId; // 🔹 referência opcional para agendamento
  }[];
}

const ClientMemorySchema = new Schema<IClientMemory>({
  clientId: { type: String, required: true },
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
  interactions: [
    {
      sender: { type: String, enum: ['client', 'bot'], required: true },
      message: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      topics: [String],
      sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
      appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' }, // 🔹
    },
  ],
});

const ClientMemory = mongoose.model<IClientMemory>('ClientMemory', ClientMemorySchema);
export default ClientMemory;
