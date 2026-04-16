import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  hostelId: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  booking: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  invoiceNumber?: string;
  idempotencyKey?: string;
  paymentMethod?: string;
  billingYear?: number;
  billingMonth?: number;
  billingPeriod?: string;
  dueDate?: Date;
  failureReason?: string;
  gatewayPayload?: Record<string, any>;
  status: 'Pending' | 'Paid' | 'Failed';
  paymentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    invoiceNumber: { type: String },
    idempotencyKey: { type: String },
    paymentMethod: { type: String },
    billingYear: { type: Number },
    billingMonth: { type: Number },
    billingPeriod: { type: String },
    dueDate: { type: Date },
    failureReason: { type: String },
    gatewayPayload: { type: Object },
    status: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
    paymentDate: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.index({ hostelId: 1, user: 1, status: 1 });
paymentSchema.index({ hostelId: 1, createdAt: -1 });
paymentSchema.index({ hostelId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ hostelId: 1, user: 1, createdAt: -1 });
paymentSchema.index({ hostelId: 1, user: 1, billingYear: -1, billingMonth: -1 });
paymentSchema.index({ hostelId: 1, booking: 1, billingPeriod: 1 });
paymentSchema.index({ hostelId: 1, razorpayOrderId: 1 });
paymentSchema.index(
  { hostelId: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invoiceNumber: { $exists: true, $type: 'string' },
    },
  }
);
paymentSchema.index(
  { hostelId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $exists: true, $type: 'string' },
    },
  }
);
paymentSchema.index(
  { hostelId: 1, razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpayPaymentId: { $exists: true, $type: 'string' },
    },
  }
);

export const Payment = mongoose.model<any>('Payment', paymentSchema);
