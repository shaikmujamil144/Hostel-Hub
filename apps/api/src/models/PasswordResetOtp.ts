import mongoose, { Schema, Types } from 'mongoose';

export interface IPasswordResetOtp {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  hostelId: Types.ObjectId;
  channel: 'email' | 'phone';
  contact: string;
  otpHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetOtpSchema: any = new (mongoose as any).Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    channel: { type: String, enum: ['email', 'phone'], required: true },
    contact: { type: String, required: true, trim: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date },
  },
  { timestamps: true }
);

passwordResetOtpSchema.index({ userId: 1, contact: 1, createdAt: -1 });

export const PasswordResetOtp = mongoose.model<any>('PasswordResetOtp', passwordResetOtpSchema);
