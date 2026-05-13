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

  // Verificação antiga por link/token
  emailToken?: string;
  emailTokenExpiry?: Date;

  // Nova verificação por código
  emailVerificationCode?: string;
  emailVerificationCodeExpiry?: Date;
  emailVerificationAttempts?: number;

  resetPasswordToken?: string;
  resetPasswordExpiry?: Date;

  // Bloqueio
  status: UserStatus;
  blockedReason?: string;
  blockedAt?: Date;

  // Ligar/Desligar TODOS os bots desse usuário
  botsEnabled: boolean;

  // timestamps
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true, required: true, trim: true },
    email: { type: String, unique: true, required: true, trim: true },
    passwordHash: { type: String, required: true },

    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
      required: true,
    },

    emailVerified: { type: Boolean, default: false },

    // Verificação antiga por link/token
    emailToken: { type: String },
    emailTokenExpiry: { type: Date },

    // Nova verificação por código
    emailVerificationCode: { type: String },
    emailVerificationCodeExpiry: { type: Date },
    emailVerificationAttempts: { type: Number, default: 0 },

    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },

    // Bloqueio
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
      index: true,
    },
    blockedReason: { type: String },
    blockedAt: { type: Date },

    // Flag global dos bots
    botsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', userSchema);