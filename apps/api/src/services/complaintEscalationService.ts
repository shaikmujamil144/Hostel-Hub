import { Types } from 'mongoose';
import { Complaint } from '../models/Complaint';
import { Hostel } from '../models/Hostel';
import { NotificationType } from '../models/Notification';
import { createTenantNotification } from './notificationService';
import { getEscalationWindowHours, getMaxEscalationLevel } from './slaPolicyService';

const resolveHistoryActorId = (complaint: any, actorUserId?: string): Types.ObjectId => {
  const candidates = [
    actorUserId,
    complaint?.assignedTo?._id ? String(complaint.assignedTo._id) : undefined,
    complaint?.assignedTo ? String(complaint.assignedTo) : undefined,
    complaint?.user?._id ? String(complaint.user._id) : undefined,
    complaint?.user ? String(complaint.user) : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && Types.ObjectId.isValid(candidate)) {
      return new Types.ObjectId(candidate);
    }
  }

  return new Types.ObjectId();
};

type EscalationInput = {
  tenantId: string;
  actorUserId?: string;
  onEscalated?: (payload: any) => void;
};

type EscalationResult = {
  escalated: number;
  skipped: number;
  maxEscalationLevel: number;
  data: any[];
};

export const escalateOverdueComplaintsForTenant = async (
  input: EscalationInput
): Promise<EscalationResult> => {
  const now = new Date();
  const hostel: any = await Hostel.findOne({ _id: input.tenantId }).select('subscriptionPlan').lean();
  const maxEscalationLevel = getMaxEscalationLevel(hostel?.subscriptionPlan as any);
  const escalationWindowHours = getEscalationWindowHours(hostel?.subscriptionPlan as any);

  const overdueComplaints = await Complaint.find({
    hostelId: input.tenantId,
    status: { $in: ['Open', 'InProgress'] },
    slaDueAt: { $lt: now },
    escalationLevel: { $lt: maxEscalationLevel },
  })
    .limit(200)
    .populate('user', 'name email')
    .populate('assignedTo', 'name email role');

  if (overdueComplaints.length === 0) {
    return {
      escalated: 0,
      skipped: 0,
      maxEscalationLevel,
      data: [],
    };
  }

  const updated: any[] = [];
  for (const complaint of overdueComplaints) {
    complaint.escalationLevel = Math.min(maxEscalationLevel, (complaint.escalationLevel || 0) + 1);
    complaint.escalatedAt = now;

    if (complaint.priorityLabel !== 'High') {
      complaint.priorityLabel = 'High';
    }
    complaint.priorityScore = Math.max(complaint.priorityScore || 0, 90);

    const factors = new Set((complaint.priorityFactors || []).map((f: string) => String(f)));
    factors.add('SLA breach detected');
    complaint.priorityFactors = Array.from(factors);

    complaint.slaDueAt = new Date(now.getTime() + escalationWindowHours * 60 * 60 * 1000);

    const changedBy = resolveHistoryActorId(complaint, input.actorUserId);

    complaint.history.push({
      action: 'Escalated',
      changedBy,
      changedAt: now,
      fromStatus: complaint.status,
      toStatus: complaint.status,
      note: `Complaint auto-escalated due to SLA breach (level ${complaint.escalationLevel})`,
    });

    const saved = await complaint.save();
    updated.push(saved);

    await createTenantNotification({
      tenantId: input.tenantId,
      type: NotificationType.COMPLAINT_STATUS_UPDATED,
      title: 'Complaint escalated',
      message: `SLA breach escalation L${saved.escalationLevel}: ${saved.title}`,
      entityType: 'Complaint',
      entityId: String(saved._id),
      metadata: {
        status: saved.status,
        escalationLevel: saved.escalationLevel,
      },
    });

    if (input.onEscalated) {
      input.onEscalated(saved);
    }
  }

  return {
    escalated: updated.length,
    skipped: 0,
    maxEscalationLevel,
    data: updated,
  };
};

export const runAutoEscalationSweep = async (options?: {
  onEscalated?: (tenantId: string, payload: any) => void;
}): Promise<{
  tenantsScanned: number;
  escalatedTotal: number;
}> => {
  const activeHostels = await Hostel.find({ isActive: true }).select('_id').lean();
  let escalatedTotal = 0;

  for (const hostel of activeHostels) {
    const tenantId = String(hostel._id);
    const result = await escalateOverdueComplaintsForTenant({
      tenantId,
      onEscalated: options?.onEscalated
        ? (payload) => options.onEscalated?.(tenantId, payload)
        : undefined,
    });
    escalatedTotal += result.escalated;
  }

  return {
    tenantsScanned: activeHostels.length,
    escalatedTotal,
  };
};
