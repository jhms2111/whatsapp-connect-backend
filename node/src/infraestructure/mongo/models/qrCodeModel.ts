// src/infraestructure/mongo/models/qrImageModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IQRCode extends Document {
  ownerUsername: string;           // dono (cliente)
  imageUrl: string;                // URL absoluta do arquivo
  originalName?: string | null;    // nome do arquivo original
  createdAt?: Date;
  updatedAt?: Date;
}

const QRCodeSchema = new Schema<IQRCode>(
  {
    ownerUsername: { type: String, required: true, index: true, unique: true },
    imageUrl: { type: String, required: true },
    originalName: { type: String, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.QRCode as mongoose.Model<IQRCode>) ||
  mongoose.model<IQRCode>('QRCode', QRCodeSchema);
