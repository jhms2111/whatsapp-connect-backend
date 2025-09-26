import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  emailToken?: string;
  emailTokenExpiry?: Date;

  // 🔽 novos campos
  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true, required: true, trim: true },
    email: { type: String, unique: true, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user', required: true },
    emailVerified: { type: Boolean, default: false },
    emailToken: { type: String },
    emailTokenExpiry: { type: Date },

    // 🔽 reset de senha
    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', userSchema);
