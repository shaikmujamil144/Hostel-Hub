import express from 'express';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { notificationListQuerySchema } from '../validators/commonValidators';

const router = express.Router();

router.route('/').get(protect, validateRequest({ query: notificationListQuerySchema }), getNotifications);
router.route('/mark-all-read').patch(protect, markAllNotificationsRead);
router.route('/:id/read').patch(protect, markNotificationRead);

export default router;
