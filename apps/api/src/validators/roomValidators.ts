import { z } from 'zod';

export const createRoomSchema = z.object({
  roomNumber: z.string().min(1).max(20),
  capacity: z.coerce.number().int().min(1).max(20),
  type: z.enum(['AC', 'Non-AC']),
  monthlyRent: z.coerce.number().min(0),
});
