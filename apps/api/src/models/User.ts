import mongoose, { Schema, Types } from 'mongoose';

export enum Role {
  ADMIN = 'Admin',
  STAFF = 'Staff',
  STUDENT = 'Student',
}

export interface IUser {
  _id: Types.ObjectId;
  hostelId: Types.ObjectId;
  registrationId?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    registrationId: { type: String, trim: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(Role), default: Role.STUDENT },
    phone: { type: String },
  },
  { timestamps: true }
);

userSchema.index({ hostelId: 1, email: 1 }, { unique: true });
userSchema.index({ hostelId: 1, registrationId: 1 }, { unique: true, sparse: true });
userSchema.index({ hostelId: 1, role: 1, createdAt: -1 });

export const User = mongoose.model<any>('User', userSchema);
