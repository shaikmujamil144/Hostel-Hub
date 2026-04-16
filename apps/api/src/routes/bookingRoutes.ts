import express from 'express';
import { createBooking, getBookings, getUnallocatedStudents } from '../controllers/bookingController';
import { protect, staffOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { createBookingSchema } from '../validators/bookingValidators';
import { bookingListQuerySchema } from '../validators/commonValidators';

const router = express.Router();

router.get('/unallocated-students', protect, staffOnly, getUnallocatedStudents);

router.route('/')
  .get(protect, staffOnly, validateRequest({ query: bookingListQuerySchema }), getBookings)
  .post(protect, staffOnly, validateRequest({ body: createBookingSchema }), createBooking);

export default router;
