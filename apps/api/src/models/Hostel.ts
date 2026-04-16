import mongoose, { Types } from 'mongoose';

export enum SubscriptionPlan {
  BASIC = 'Basic',
  PRO = 'Pro',
  ENTERPRISE = 'Enterprise',
}

export interface IHostel {
  _id: Types.ObjectId;
  name: string;
  ownerId?: Types.ObjectId;
  subscriptionPlan: SubscriptionPlan;
  floorsCount: number;
  totalRooms: number;
  totalBeds: number;
  floors: Array<{
    floorNumber: number;
    rooms: Array<{
      roomLabel: string;
      beds: number;
    }>;
  }>;
  referenceImages: string[];
  paymentSettings?: {
    upiId?: string;
    upiDisplayName?: string;
    upiQrImageData?: string;
  };
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const hostelSchema: any = new (mongoose as any).Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subscriptionPlan: {
      type: String,
      enum: Object.values(SubscriptionPlan),
      default: SubscriptionPlan.BASIC,
    },
    floorsCount: { type: Number, default: 0 },
    totalRooms: { type: Number, default: 0 },
    totalBeds: { type: Number, default: 0 },
    floors: [
      {
        floorNumber: { type: Number, required: true },
        rooms: [
          {
            roomLabel: { type: String, required: true, trim: true },
            beds: { type: Number, required: true, min: 1 },
          },
        ],
      },
    ],
    referenceImages: [{ type: String }],
    paymentSettings: {
      upiId: { type: String, trim: true },
      upiDisplayName: { type: String, trim: true },
      upiQrImageData: { type: String },
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

hostelSchema.index({ name: 1 });
hostelSchema.index({ ownerId: 1, createdAt: -1 });
hostelSchema.index({ ownerId: 1, isDeleted: 1, updatedAt: -1 });

export const Hostel = mongoose.model<any>('Hostel', hostelSchema);