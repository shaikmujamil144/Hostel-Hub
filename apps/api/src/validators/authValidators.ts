import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  registrationId: z.string().min(3).max(40).optional(),
  role: z.enum(['Admin', 'Staff', 'Student']).optional(),
  phone: z.string().min(8).max(20).optional(),
  hostelId: z.string().min(24).max(24).optional(),
  hostelName: z.string().min(2).max(120).optional(),
  subscriptionPlan: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().optional(),
  identifier: z.string().min(3).max(120).optional(),
  adminId: z.string().min(3).max(120).optional(),
  loginAs: z.enum(['Admin', 'Student']).optional(),
  password: z.string().min(6).max(128),
  hostelId: z.string().min(24).max(24).optional(),
});

export const registerStudentSchema = z.object({
  hostelId: z.string().min(24).max(24),
  registrationId: z.string().min(3).max(40),
  name: z.string().min(2).max(80),
  phone: z.string().min(8).max(20),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export const forgotPasswordRequestSchema = z.object({
  loginAs: z.enum(['Admin', 'Student']),
  contact: z.string().min(3).max(120),
  hostelId: z.string().min(24).max(24).optional(),
});

export const forgotPasswordVerifySchema = z.object({
  loginAs: z.enum(['Admin', 'Student']),
  contact: z.string().min(3).max(120),
  hostelId: z.string().min(24).max(24).optional(),
  otp: z.string().length(6),
  newPassword: z.string().min(6).max(128),
});
