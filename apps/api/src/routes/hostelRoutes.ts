import express from 'express';
import {
  createHostel,
  getCurrentHostel,
  getCurrentHostelPaymentSettings,
  getCurrentHostelSlaPolicy,
  getDeletedOwnedHostels,
  getOwnedHostelById,
  getOwnedHostels,
  permanentlyDeleteOwnedHostel,
  restoreOwnedHostel,
  softDeleteOwnedHostel,
  updateOwnedHostel,
  updateCurrentHostelPlan,
  updateCurrentHostelPaymentSettings,
} from '../controllers/hostelController';
import { adminOnly, protect } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import {
  createHostelSchema,
  hostelIdParamSchema,
  updateHostelPaymentSettingsSchema,
  updateHostelPlanSchema,
  updateOwnedHostelSchema,
} from '../validators/hostelValidators';

const router = express.Router();

router.get('/me', protect, getCurrentHostel);
router.get('/me/sla-policy', protect, getCurrentHostelSlaPolicy);
router.get('/me/payment-settings', protect, getCurrentHostelPaymentSettings);
router.get('/owned', protect, adminOnly, getOwnedHostels);
router.get('/owned/recycle-bin', protect, adminOnly, getDeletedOwnedHostels);
router.get('/:id', protect, adminOnly, validateRequest({ params: hostelIdParamSchema }), getOwnedHostelById);
router.post('/', protect, adminOnly, validateRequest({ body: createHostelSchema }), createHostel);
router.patch('/me/plan', protect, adminOnly, validateRequest({ body: updateHostelPlanSchema }), updateCurrentHostelPlan);
router.patch(
  '/me/payment-settings',
  protect,
  adminOnly,
  validateRequest({ body: updateHostelPaymentSettingsSchema }),
  updateCurrentHostelPaymentSettings
);
router.patch(
  '/:id',
  protect,
  adminOnly,
  validateRequest({ params: hostelIdParamSchema, body: updateOwnedHostelSchema }),
  updateOwnedHostel
);
router.delete('/:id', protect, adminOnly, validateRequest({ params: hostelIdParamSchema }), softDeleteOwnedHostel);
router.patch(
  '/:id/restore',
  protect,
  adminOnly,
  validateRequest({ params: hostelIdParamSchema }),
  restoreOwnedHostel
);
router.delete(
  '/:id/permanent',
  protect,
  adminOnly,
  validateRequest({ params: hostelIdParamSchema }),
  permanentlyDeleteOwnedHostel
);

export default router;
