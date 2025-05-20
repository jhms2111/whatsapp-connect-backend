import mongoose, { Schema, Document } from 'mongoose';

export interface ICliente extends Document {
  username: string;
  createdAt: Date;
  lastLogin?: Date;
}

const clienteSchema = new Schema<ICliente>({
  username: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true },
  lastLogin: { type: Date },
});

const Cliente = mongoose.model<ICliente>('Cliente', clienteSchema);
export default Cliente;