import express from 'express';
import {
	getDashboardAnalytics,
	getDashboardStats,
	getOwnerNetworkAnalytics,
	getStudentDashboardSummary,
} from '../controllers/dashboardController';
import { adminOnly, protect, staffOnly } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/stats', protect, staffOnly, getDashboardStats);
router.get('/analytics', protect, staffOnly, getDashboardAnalytics);
router.get('/network-analytics', protect, adminOnly, getOwnerNetworkAnalytics);
router.get('/student-summary', protect, getStudentDashboardSummary);

export default router;
