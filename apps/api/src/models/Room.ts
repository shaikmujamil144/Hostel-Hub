import mongoose, { Document, Schema } from 'mongoose';

export interface IRoom extends Document {
  hostelId: mongoose.Types.ObjectId;
  roomNumber: string;
  capacity: number;
  currentOccupancy: number;
  type: 'AC' | 'Non-AC';
  monthlyRent: number;
  createdAt: Date;
  updatedAt: Date;
}

const roomSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    roomNumber: { type: String, required: true },
    capacity: { type: Number, required: true },
    currentOccupancy: { type: Number, default: 0 },
    type: { type: String, enum: ['AC', 'Non-AC'], required: true },
    monthlyRent: { type: Number, required: true },
  },
  { timestamps: true }
);

roomSchema.index({ hostelId: 1, roomNumber: 1 }, { unique: true });

export const Room = mongoose.model<any>('Room', roomSchema);
