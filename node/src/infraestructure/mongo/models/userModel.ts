import mongoose, { Schema, Document, Types } from 'mongoose';
export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
}
const userSchema = new Schema<IUser>({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin','user'], default: 'user', required: true },
});
export default mongoose.model<IUser>('User', userSchema);
