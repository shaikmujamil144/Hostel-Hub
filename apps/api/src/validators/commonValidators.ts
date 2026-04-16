import { z } from 'zod';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['Pending', 'Paid', 'Failed']).optional(),
});

export const manualPaymentRequestSchema = z
  .object({
    mode: z.enum(['UPI', 'Cash']),
    amount: z.coerce.number().positive(),
    transactionRef: z.string().trim().max(80).optional(),
    proofImageData: z.string().trim().max(3000000),
    note: z.string().trim().max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'UPI' && !value.transactionRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'UTR/transaction reference is required for UPI payment',
        path: ['transactionRef'],
      });
    }
  });

export const manualPaymentReviewSchema = z.object({
  decision: z.enum(['Approve', 'Reject']),
  note: z.string().trim().max(240).optional(),
});

export const bulkMonthlyFeeAllocationSchema = z.object({
  monthName: z
    .string()
    .trim()
    .min(3)
    .transform((value) => value.toLowerCase()),
  year: z.coerce.number().int().min(2020).max(2100),
  amount: z.coerce.number().positive(),
  specialFeeName: z.string().trim().min(2).max(60).optional(),
  dueDate: z.coerce.date().optional(),
  overwriteExistingPending: z.coerce.boolean().optional().default(false),
});

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

export const complaintListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['Open', 'InProgress', 'Resolved']).optional(),
  assignedTo: z.string().trim().optional(),
  search: z.string().max(100).optional(),
  priority: z.enum(['Low', 'Medium', 'High']).optional(),
  sortBy: z.enum(['priority', 'recent']).optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

export const bookingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['Active', 'Completed', 'Cancelled']).optional(),
});
