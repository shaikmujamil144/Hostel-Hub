import mongoose, { Document, Schema } from 'mongoose';

export interface IBooking extends Document {
  hostelId: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  status: 'Active' | 'Completed' | 'Cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
  },
  { timestamps: true }
);

bookingSchema.index({ hostelId: 1, user: 1, status: 1 });
bookingSchema.index({ hostelId: 1, room: 1, status: 1 });
bookingSchema.index({ hostelId: 1, createdAt: -1 });
bookingSchema.index({ hostelId: 1, status: 1, createdAt: -1 });

export const Booking = mongoose.model<any>('Booking', bookingSchema);
