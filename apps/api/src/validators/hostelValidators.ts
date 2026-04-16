import { z } from 'zod';

export const updateHostelPlanSchema = z.object({
  subscriptionPlan: z.enum(['Basic', 'Pro', 'Enterprise']),
});

export const updateHostelPaymentSettingsSchema = z.object({
  upiId: z.string().trim().min(3).max(120).optional(),
  upiDisplayName: z.string().trim().min(2).max(120).optional(),
  upiQrImageData: z.string().trim().max(3000000).optional(),
});

const hostelRoomSchema = z.object({
  roomLabel: z.string().min(1).max(60),
  beds: z.number().int().min(1).max(20),
});

const hostelFloorSchema = z.object({
  floorNumber: z.number().int().min(1).max(100),
  rooms: z.array(hostelRoomSchema).min(1).max(300),
});

export const createHostelSchema = z.object({
  name: z.string().min(2).max(140),
  subscriptionPlan: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
  floors: z.array(hostelFloorSchema).min(1).max(100),
  referenceImages: z.array(z.string().max(2000000)).max(8).optional(),
});

export const updateOwnedHostelSchema = z.object({
  name: z.string().min(2).max(140),
  subscriptionPlan: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
  floors: z.array(hostelFloorSchema).min(1).max(100),
  referenceImages: z.array(z.string().max(2000000)).max(8).optional(),
});

export const hostelIdParamSchema = z.object({
  id: z.string().min(24).max(24),
});
