import express from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { listQuerySchema } from '../validators/commonValidators';

const router = express.Router();

router.get('/', protect, adminOnly, validateRequest({ query: listQuerySchema }), getAuditLogs);

export default router;
