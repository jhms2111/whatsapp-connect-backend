import mongoose, { Document, Schema } from "mongoose";

export interface CustomerNumber extends Document {
  userId: string;
  phoneNumber: string;
  twilioSid: string;
  purchasedAt: Date;
  expiresAt?: Date;
  active: boolean;
}

const CustomerNumberSchema = new Schema<CustomerNumber>({
  userId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  twilioSid: { type: String, required: true },
  purchasedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  active: { type: Boolean, default: true },
});

export default mongoose.model<CustomerNumber>("CustomerNumber", CustomerNumberSchema);
