import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
  COMPLAINT_CREATED = 'COMPLAINT_CREATED',
  COMPLAINT_STATUS_UPDATED = 'COMPLAINT_STATUS_UPDATED',
  BOOKING_CREATED = 'BOOKING_CREATED',
}

export interface INotification extends Document {
  hostelId: mongoose.Types.ObjectId;
  recipient?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: mongoose.Types.ObjectId;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    metadata: { type: Object },
  },
  { timestamps: true }
);

notificationSchema.index({ hostelId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ hostelId: 1, recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<any>('Notification', notificationSchema);
