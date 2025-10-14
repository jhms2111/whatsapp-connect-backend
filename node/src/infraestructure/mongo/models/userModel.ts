// src/infraestructure/mongo/models/userModel.ts
import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'blocked';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerified: boolean;
  emailToken?: string;
  emailTokenExpiry?: Date;
  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;

  // Bloqueio
  status: UserStatus;          // 'active' | 'blocked'
  blockedReason?: string;
  blockedAt?: Date;

  // timestamps
  createdAt: Date;
  updatedAt: Date;
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
    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },

    // Bloqueio
    status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
    blockedReason: { type: String },
    blockedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });

export default mongoose.model<IUser>('User', userSchema);
