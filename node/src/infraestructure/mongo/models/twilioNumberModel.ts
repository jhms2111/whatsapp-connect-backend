import mongoose, { Schema, Document } from 'mongoose';

export interface ITwilioNumber extends Document {
  owner: string; // username do cliente dono do número
  number: string; // número do Twilio (ex: whatsapp:+14155238886)
  accountSid: string;
  authToken: string;
}

const twilioNumberSchema: Schema = new Schema({
  owner: { type: String, required: true }, // username
  number: { type: String, required: true, unique: true },
  accountSid: { type: String, required: true },
  authToken: { type: String, required: true }
});

const TwilioNumber = mongoose.model<ITwilioNumber>('TwilioNumber', twilioNumberSchema);

export default TwilioNumber;
