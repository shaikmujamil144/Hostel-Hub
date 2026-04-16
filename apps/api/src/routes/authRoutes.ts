import express from 'express';
import {
	registerUser,
	registerStudent,
	loginUser,
	getHostels,
	requestPasswordResetOtp,
	resetPasswordWithOtp,
} from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';
import {
	loginSchema,
	registerSchema,
	registerStudentSchema,
	forgotPasswordRequestSchema,
	forgotPasswordVerifySchema,
} from '../validators/authValidators';

const router = express.Router();

router.post('/register', authRateLimiter, validateRequest({ body: registerSchema }), registerUser);
router.post('/register-student', authRateLimiter, validateRequest({ body: registerStudentSchema }), registerStudent);
router.post('/login', authRateLimiter, validateRequest({ body: loginSchema }), loginUser);
router.post(
	'/forgot-password/request-otp',
	authRateLimiter,
	validateRequest({ body: forgotPasswordRequestSchema }),
	requestPasswordResetOtp
);
router.post(
	'/forgot-password/reset',
	authRateLimiter,
	validateRequest({ body: forgotPasswordVerifySchema }),
	resetPasswordWithOtp
);
router.get('/hostels', getHostels);

export default router;
