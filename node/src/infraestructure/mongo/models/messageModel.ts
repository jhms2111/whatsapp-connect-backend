import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  roomId: string;
  sender: string;
  message: string;
  sent: boolean;
  timestamp: Date;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  to?: string;
}

const messageSchema = new Schema<IMessage>({
  roomId: { type: String, required: true, index: true },
  sender: { type: String, required: true },
  message: { type: String, required: true },
  sent: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  fileUrl: { type: String },
  fileName: { type: String },
  fileType: { type: String },
  to: { type: String },
});

const Message =
  mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);

export default Message;
