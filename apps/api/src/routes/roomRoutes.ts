import express from 'express';
import { getRooms, createRoom, getRoomDetails, syncRoomsFromHostel } from '../controllers/roomController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { listQuerySchema } from '../validators/commonValidators';
import { createRoomSchema } from '../validators/roomValidators';

const router = express.Router();

router.route('/')
  .get(protect, validateRequest({ query: listQuerySchema }), getRooms)
  .post(protect, adminOnly, validateRequest({ body: createRoomSchema }), createRoom);

router.post('/sync-from-hostel', protect, adminOnly, syncRoomsFromHostel);

router.get('/:id', protect, adminOnly, getRoomDetails);

export default router;
