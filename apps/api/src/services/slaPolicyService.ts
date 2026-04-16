import { SubscriptionPlan } from '../models/Hostel';

export type ComplaintPriority = 'Low' | 'Medium' | 'High';

const HOURS_BY_PLAN: Record<SubscriptionPlan, Record<ComplaintPriority, number>> = {
  [SubscriptionPlan.BASIC]: {
    Low: 72,
    Medium: 48,
    High: 24,
  },
  [SubscriptionPlan.PRO]: {
    Low: 48,
    Medium: 24,
    High: 12,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    Low: 24,
    Medium: 12,
    High: 6,
  },
};

const ESCALATION_WINDOW_HOURS_BY_PLAN: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.BASIC]: 24,
  [SubscriptionPlan.PRO]: 12,
  [SubscriptionPlan.ENTERPRISE]: 6,
};

const MAX_ESCALATION_LEVEL_BY_PLAN: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.BASIC]: 1,
  [SubscriptionPlan.PRO]: 2,
  [SubscriptionPlan.ENTERPRISE]: 3,
};

const DEFAULT_PLAN = SubscriptionPlan.BASIC;

export const getSlaHours = (
  plan: SubscriptionPlan | undefined,
  priority: ComplaintPriority | undefined
): number => {
  const safePlan = plan || DEFAULT_PLAN;
  const safePriority: ComplaintPriority = priority || 'Low';
  return HOURS_BY_PLAN[safePlan][safePriority];
};

export const getSlaDueAt = (
  plan: SubscriptionPlan | undefined,
  priority: ComplaintPriority | undefined,
  from: Date = new Date()
): Date => {
  const hours = getSlaHours(plan, priority);
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
};

export const getEscalationWindowHours = (plan: SubscriptionPlan | undefined): number => {
  return ESCALATION_WINDOW_HOURS_BY_PLAN[plan || DEFAULT_PLAN];
};

export const getMaxEscalationLevel = (plan: SubscriptionPlan | undefined): number => {
  return MAX_ESCALATION_LEVEL_BY_PLAN[plan || DEFAULT_PLAN];
};
