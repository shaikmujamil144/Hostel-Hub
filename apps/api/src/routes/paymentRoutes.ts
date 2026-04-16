import express from 'express';
import {
    allocateMonthlyFeeToAllStudents,
    createOrderForInvoice,
	createOrder,
	devMarkInvoicePaid,
	downloadPaymentInvoicePdf,
	exportRevenueMonthWiseReportExcel,
	exportStudentMonthWiseReportExcel,
	exportPendingFeesRoomWiseCsv,
	exportPaymentsCsv,
	getPaymentIndexesDebug,
	getPendingFeesRoomWise,
	getPaymentReportsOverview,
	getPayments,
	handleRazorpayWebhook,
	requestManualPayment,
	reviewManualPayment,
	verifyPayment,
} from '../controllers/paymentController';
import { adminOnly, protect, staffOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import {
  bulkMonthlyFeeAllocationSchema,
  manualPaymentRequestSchema,
  manualPaymentReviewSchema,
  paymentListQuerySchema,
} from '../validators/commonValidators';

const router = express.Router();

router.post('/webhook', handleRazorpayWebhook);
router.get('/debug/indexes', protect, adminOnly, getPaymentIndexesDebug);
router.get('/reports/overview', protect, staffOnly, getPaymentReportsOverview);
router.get('/reports/student-monthwise/export', protect, staffOnly, exportStudentMonthWiseReportExcel);
router.get('/reports/revenue-monthwise/export', protect, staffOnly, exportRevenueMonthWiseReportExcel);
router.get('/export', protect, staffOnly, exportPaymentsCsv);
router.get('/pending-roomwise/export', protect, staffOnly, exportPendingFeesRoomWiseCsv);
router.get('/pending-roomwise', protect, staffOnly, getPendingFeesRoomWise);
router.get('/', protect, validateRequest({ query: paymentListQuerySchema }), getPayments);
router.get('/:id/invoice', protect, downloadPaymentInvoicePdf);
router.post('/:id/order', protect, createOrderForInvoice);
router.post('/:id/dev-pay', protect, devMarkInvoicePaid);
router.post('/:id/manual-request', protect, validateRequest({ body: manualPaymentRequestSchema }), requestManualPayment);
router.post('/:id/manual-review', protect, staffOnly, validateRequest({ body: manualPaymentReviewSchema }), reviewManualPayment);
router.post('/allocate-monthly', protect, adminOnly, validateRequest({ body: bulkMonthlyFeeAllocationSchema }), allocateMonthlyFeeToAllStudents);
router.post('/order', protect, createOrder);
router.post('/verify', protect, verifyPayment);

export default router;
