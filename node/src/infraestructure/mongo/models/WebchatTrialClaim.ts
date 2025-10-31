import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebchatTrialClaim extends Document {
  username: string;   // dono da conta
  phone: string;      // E.164 normalizado
  claimedAt: Date;
  amount: number;     // ex.: 100
}

const WebchatTrialClaimSchema = new Schema<IWebchatTrialClaim>({
  username: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true, unique: true }, // um claim por telefone
  claimedAt: { type: Date, required: true, default: Date.now },
  amount: { type: Number, required: true, default: 100 },
});

const WebchatTrialClaim: Model<IWebchatTrialClaim> =
  mongoose.models.WebchatTrialClaim || mongoose.model<IWebchatTrialClaim>('WebchatTrialClaim', WebchatTrialClaimSchema);

export default WebchatTrialClaim;
