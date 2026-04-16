import express from 'express';
import {
  autoEscalateOverdueComplaints,
  assignComplaint,
  createComplaint,
  getComplaintAssignees,
  getComplaintById,
  getComplaints,
  updateComplaintStatus,
} from '../controllers/complaintController';
import { protect, staffOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { complaintListQuerySchema } from '../validators/commonValidators';

const router = express.Router();

router.route('/')
  .post(protect, createComplaint)
  .get(protect, validateRequest({ query: complaintListQuerySchema }), getComplaints);

router.route('/assignees')
  .get(protect, staffOnly, getComplaintAssignees);

router.route('/escalate-overdue')
  .post(protect, staffOnly, autoEscalateOverdueComplaints);

router.route('/:id')
  .get(protect, getComplaintById)
  .put(protect, staffOnly, updateComplaintStatus);

router.route('/:id/assign')
  .put(protect, staffOnly, assignComplaint);

export default router;
