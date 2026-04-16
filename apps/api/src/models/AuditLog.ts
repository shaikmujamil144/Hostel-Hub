import mongoose from 'mongoose';

const auditLogSchema: any = new (mongoose as any).Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String },
    tenantId: { type: String, required: true, default: 'default-tenant' },
    metadata: { type: Object },
  },
  { timestamps: true }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<any>('AuditLog', auditLogSchema);
