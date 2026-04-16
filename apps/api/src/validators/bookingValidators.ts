import { z } from 'zod';

export const createBookingSchema = z.object({
  user: z.string().min(1),
  room: z.string().min(1),
  startDate: z.coerce.date(),
});
