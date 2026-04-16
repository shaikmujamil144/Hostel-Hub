import mongoose from 'mongoose';

export interface ISchedulerLock {
  key: string;
  ownerId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schedulerLockSchema: any = new (mongoose as any).Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const SchedulerLock = mongoose.model<any>('SchedulerLock', schedulerLockSchema);
