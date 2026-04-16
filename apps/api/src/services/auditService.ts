import { AuditLog } from '../models/AuditLog';

type AuditParams = {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
};

export const logAuditEvent = async (params: AuditParams) => {
  await AuditLog.create({
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    tenantId: params.tenantId || 'default-tenant',
    metadata: params.metadata || {},
  });
};
