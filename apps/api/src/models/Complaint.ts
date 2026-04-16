import mongoose, { Document, Schema } from 'mongoose';

export type ComplaintStatus = 'Open' | 'InProgress' | 'Resolved';

export interface IComplaintHistoryEntry {
  action: 'Created' | 'Assigned' | 'StatusChanged' | 'Escalated';
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  note?: string;
  fromStatus?: ComplaintStatus;
  toStatus?: ComplaintStatus;
  assignedTo?: mongoose.Types.ObjectId;
}

export interface IComplaint extends Document {
  hostelId: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: ComplaintStatus;
  priorityLabel: 'Low' | 'Medium' | 'High';
  priorityScore: number;
  priorityFactors: string[];
  assignedTo?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
  escalationLevel: number;
  slaDueAt: Date;
  history: IComplaintHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const complaintHistorySchema: any = new (mongoose as any).Schema(
  {
    action: { type: String, enum: ['Created', 'Assigned', 'StatusChanged', 'Escalated'], required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: { type: String },
    fromStatus: { type: String, enum: ['Open', 'InProgress', 'Resolved'] },
    toStatus: { type: String, enum: ['Open', 'InProgress', 'Resolved'] },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const complaintSchema: any = new (mongoose as any).Schema(
  {
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['Open', 'InProgress', 'Resolved'], default: 'Open' },
    priorityLabel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low', index: true },
    priorityScore: { type: Number, default: 10 },
    priorityFactors: { type: [String], default: [] },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignedAt: { type: Date },
    firstResponseAt: { type: Date },
    resolvedAt: { type: Date },
    escalatedAt: { type: Date },
    escalationLevel: { type: Number, default: 0 },
    slaDueAt: { type: Date, required: true, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) },
    history: { type: [complaintHistorySchema], default: [] },
  },
  { timestamps: true }
);

complaintSchema.index({ hostelId: 1, status: 1, createdAt: -1 });
complaintSchema.index({ hostelId: 1, assignedTo: 1, status: 1, createdAt: -1 });
complaintSchema.index({ hostelId: 1, priorityLabel: 1, status: 1, createdAt: -1 });

export const Complaint = mongoose.model<any>('Complaint', complaintSchema);
