import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';
import { Role } from '../models/User';
import { paginationMeta, parsePagination } from '../utils/pagination';
import * as XLSX from 'xlsx';

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const toReadableTitle = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const toSpecialFeeToken = (value?: string) => {
  const sanitized = String(value || 'special-fee')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'special-fee';
};

const generateInvoiceNumber = () => {
  const ts = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `INV-${ts}-${random}`;
};

const buildBillingMeta = (inputDate?: string | Date) => {
  const date = inputDate ? new Date(inputDate) : new Date();
  const billingYear = date.getFullYear();
  const billingMonth = date.getMonth() + 1;
  const billingPeriod = `${billingYear}-${String(billingMonth).padStart(2, '0')}`;
  const dueDate = new Date(billingYear, date.getMonth(), 10);
  return { billingYear, billingMonth, billingPeriod, dueDate };
};

const formatBillingPeriodLabel = (billingPeriod?: string) => {
  if (!billingPeriod) return 'N/A';

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  if (/^\d{4}-SPL-/.test(billingPeriod)) {
    const [yearText, , token] = billingPeriod.split('-');
    const label = String(token || 'special-fee')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return `${label || 'Special Fee'} ${yearText}`;
  }

  if (!/^\d{4}-\d{2}$/.test(billingPeriod)) return billingPeriod;
  const [yearText, monthText] = billingPeriod.split('-');
  const monthIndex = Number(monthText) - 1;
  if (monthIndex < 0 || monthIndex > 11) return billingPeriod;
  return `${monthNames[monthIndex]} ${yearText}`;
};

const isPlaceholderValue = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes('replace_me') ||
    normalized.includes('dummy') ||
    normalized === 'rzp_test_replace_me' ||
    normalized === 'dummy_key' ||
    normalized === 'dummy_secret'
  );
};

const isRazorpayConfigured = () => {
  return !isPlaceholderValue(process.env.RAZORPAY_KEY_ID) && !isPlaceholderValue(process.env.RAZORPAY_KEY_SECRET);
};

const buildRazorpayClient = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
  });
};

const escapePdfText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const generateSimpleInvoicePdf = (lines: string[]) => {
  const contentLines = lines
    .map((line, index) => `BT /F1 12 Tf 50 ${780 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentLines, 'utf8')} >>\nstream\n${contentLines}\nendstream\nendobj\n`,
  ];

  let output = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += object;
  }

  const xrefStart = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(output, 'utf8');
};

type PendingRoomWiseRow = {
  roomNumber: string;
  studentName: string;
  registrationId: string;
  amount: number;
  billingPeriod: string;
  dueDate: string;
  status: string;
};

const getPendingRoomWiseRows = async (tenantId: string): Promise<PendingRoomWiseRow[]> => {
  const pendingPayments = await Payment.find({
    hostelId: tenantId,
    status: 'Pending',
  })
    .populate('user', 'name registrationId')
    .populate({
      path: 'booking',
      select: 'room',
      populate: {
        path: 'room',
        select: 'roomNumber',
      },
    })
    .select('amount status billingPeriod dueDate user booking')
    .sort({ billingPeriod: 1, dueDate: 1, createdAt: -1 })
    .lean();

  return (pendingPayments as any[]).map((payment) => ({
    roomNumber: String(payment.booking?.room?.roomNumber || 'Unassigned'),
    studentName: String(payment.user?.name || 'Unknown'),
    registrationId: String(payment.user?.registrationId || ''),
    amount: Number(payment.amount || 0),
    billingPeriod: String(payment.billingPeriod || ''),
    dueDate: payment.dueDate ? new Date(payment.dueDate).toISOString().split('T')[0] : '',
    status: String(payment.status || 'Pending'),
  }));
};

// @desc    Get payments list
// @route   GET /api/payments
// @access  Private
export const getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const status = String(req.query.status || '').trim();

    const filter: any = { hostelId: tenantId };
    if (status) {
      filter.status = status;
    }
    if (req.user?.role === Role.STUDENT) {
      filter.user = req.user?._id;
    }

    const [items, total] = await Promise.all([
      Payment.find(filter)
        .populate('user', 'name email role')
        .populate('booking', 'status startDate endDate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({
      data: items,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create Razorpay Order
// @route   POST /api/payments/order
// @access  Private
export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { amount, bookingId } = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body?.idempotencyKey;

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ message: 'Amount must be greater than zero' });
      return;
    }

    if (!bookingId) {
      res.status(400).json({ message: 'bookingId is required' });
      return;
    }

    if (!isRazorpayConfigured()) {
      res.status(400).json({
        message: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in api .env',
      });
      return;
    }

    const booking = await Booking.findOne({ _id: bookingId, hostelId: tenantId });
    if (!booking) {
      res.status(404).json({ message: 'Booking not found' });
      return;
    }

    if (idempotencyKey) {
      const existingPayment = await Payment.findOne({
        hostelId: tenantId,
        idempotencyKey,
      });

      if (existingPayment) {
        res.status(200).json({
          order: {
            id: existingPayment.razorpayOrderId,
            amount: existingPayment.amount * 100,
            currency: existingPayment.currency,
          },
          payment: existingPayment,
          reused: true,
        });
        return;
      }
    }

    const instance = buildRazorpayClient();

    const options = {
      amount: amount * 100, // amount in the smallest currency unit
      currency: 'INR',
      receipt: `receipt_order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };

    const order = await instance.orders.create(options);

    if (!order) {
      res.status(500).json({ message: 'Some error occurred' });
      return;
    }

    // Save initial payment record
    const billingMeta = buildBillingMeta((booking as any)?.startDate);

    const payment = await Payment.create({
      hostelId: tenantId,
      user: req.user?._id,
      booking: bookingId,
      amount,
      razorpayOrderId: order.id,
      idempotencyKey,
      ...billingMeta,
      status: 'Pending',
    });

    res.json({ order, payment });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Allocate monthly fee to all active students
// @route   POST /api/payments/allocate-monthly
// @access  Private/Admin
export const allocateMonthlyFeeToAllStudents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { monthName, year, amount, dueDate, overwriteExistingPending } = req.body as {
      monthName: string;
      year: number;
      amount: number;
      dueDate?: Date;
      specialFeeName?: string;
      overwriteExistingPending?: boolean;
    };

    const normalizedMonthName = String(monthName || '').trim().toLowerCase();
    const isSpecialFee = ['special fee', 'special', 'spl fee', 'spl'].includes(normalizedMonthName);
    const billingMonth = isSpecialFee ? undefined : MONTH_NAME_TO_NUMBER[normalizedMonthName];

    if (!isSpecialFee && !billingMonth) {
      res.status(400).json({ message: 'Invalid month name' });
      return;
    }

    const specialFeeName = (req.body as any)?.specialFeeName as string | undefined;
    const specialFeeToken = isSpecialFee ? toSpecialFeeToken(specialFeeName) : '';

    const billingPeriod = isSpecialFee
      ? `${year}-SPL-${specialFeeToken}`
      : `${year}-${String(billingMonth).padStart(2, '0')}`;
    const effectiveDueDate = dueDate
      ? new Date(dueDate)
      : isSpecialFee
      ? new Date()
      : new Date(year, (billingMonth as number) - 1, 10);

    const allocationLabel = isSpecialFee
      ? `${toReadableTitle(String(specialFeeName || 'Special Fee'))} ${year}`
      : `${toReadableTitle(normalizedMonthName)} ${year}`;

    const activeBookings = await Booking.find({
      hostelId: tenantId,
      status: 'Active',
    })
      .select('_id user startDate')
      .sort({ startDate: -1 })
      .lean();

    if (!activeBookings.length) {
      res.status(200).json({
        message: `No active students found for ${allocationLabel}.`,
        billingPeriod,
        totals: { activeStudents: 0, created: 0, updated: 0, skipped: 0 },
      });
      return;
    }

    const uniqueBookingByUser = new Map<string, any>();
    for (const booking of activeBookings as any[]) {
      const userId = String(booking.user);
      if (!uniqueBookingByUser.has(userId)) {
        uniqueBookingByUser.set(userId, booking);
      }
    }

    const bookingEntries = Array.from(uniqueBookingByUser.values());
    const userIds = bookingEntries.map((booking: any) => booking.user);

    const existingPayments = await Payment.find({
      hostelId: tenantId,
      user: { $in: userIds },
      billingPeriod,
    })
      .select('_id user status amount dueDate')
      .lean();

    const existingByUser = new Map<string, any>();
    for (const payment of existingPayments as any[]) {
      existingByUser.set(String(payment.user), payment);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const booking of bookingEntries as any[]) {
      const userId = String(booking.user);
      const existing = existingByUser.get(userId);

      if (!existing) {
        await Payment.create({
          hostelId: tenantId,
          user: booking.user,
          booking: booking._id,
          amount,
          status: 'Pending',
          billingYear: year,
          billingMonth,
          billingPeriod,
          dueDate: effectiveDueDate,
        });
        created += 1;
        continue;
      }

      if (overwriteExistingPending && existing.status === 'Pending') {
        await Payment.updateOne(
          { _id: existing._id, hostelId: tenantId },
          {
            $set: {
              amount,
              dueDate: effectiveDueDate,
              billingYear: year,
              billingMonth,
              billingPeriod,
            },
          }
        );
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    res.status(201).json({
      message: `Fee allocated for ${allocationLabel}.`,
      billingPeriod,
      totals: {
        activeStudents: bookingEntries.length,
        created,
        updated,
        skipped,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create Razorpay Order for a specific invoice/payment
// @route   POST /api/payments/:id/order
// @access  Private
export const createOrderForInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const payment = await Payment.findOne({ _id: req.params.id, hostelId: tenantId });
    if (!payment) {
      res.status(404).json({ message: 'Payment invoice not found' });
      return;
    }

    if (req.user?.role === Role.STUDENT && String(payment.user) !== String(req.user?._id || '')) {
      res.status(403).json({ message: 'Not authorized to pay this invoice' });
      return;
    }

    if (payment.status === 'Paid') {
      res.status(400).json({ message: 'This invoice is already paid' });
      return;
    }

    const amount = Number(payment.amount || 0);
    if (amount <= 0) {
      res.status(400).json({ message: 'Invalid invoice amount' });
      return;
    }

    if (!isRazorpayConfigured()) {
      res.status(400).json({
        message: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in api .env',
      });
      return;
    }

    const idempotencyKey =
      (req.headers['x-idempotency-key'] as string) ||
      req.body?.idempotencyKey ||
      `invoice-${payment._id}-${Date.now()}`;

    const existingOrderPayment = await Payment.findOne({
      hostelId: tenantId,
      _id: payment._id,
      idempotencyKey,
      razorpayOrderId: { $exists: true, $type: 'string' },
    });

    if (existingOrderPayment?.razorpayOrderId) {
      res.status(200).json({
        order: {
          id: existingOrderPayment.razorpayOrderId,
          amount: existingOrderPayment.amount * 100,
          currency: existingOrderPayment.currency,
        },
        payment: existingOrderPayment,
        reused: true,
      });
      return;
    }

    const instance = buildRazorpayClient();

    const order = await instance.orders.create({
      amount: amount * 100,
      currency: payment.currency || 'INR',
      receipt: `invoice_${payment._id}_${Math.floor(Math.random() * 1000)}`,
      notes: {
        paymentId: String(payment._id),
        bookingId: String(payment.booking),
        billingPeriod: String(payment.billingPeriod || ''),
      },
    });

    payment.razorpayOrderId = order.id;
    payment.idempotencyKey = idempotencyKey;
    payment.failureReason = undefined;
    if (payment.status !== 'Paid') {
      payment.status = 'Pending';
    }
    await payment.save();

    res.json({ order, payment, reused: false });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Development fallback to simulate successful invoice payment
// @route   POST /api/payments/:id/dev-pay
// @access  Private (non-production only)
export const devMarkInvoicePaid = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ message: 'Dev payment endpoint is disabled in production' });
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const payment = await Payment.findOne({ _id: req.params.id, hostelId: tenantId });
    if (!payment) {
      res.status(404).json({ message: 'Payment invoice not found' });
      return;
    }

    if (req.user?.role === Role.STUDENT && String(payment.user) !== String(req.user?._id || '')) {
      res.status(403).json({ message: 'Not authorized to pay this invoice' });
      return;
    }

    if (payment.status === 'Paid') {
      res.json({ message: 'Invoice already paid', payment });
      return;
    }

    payment.status = 'Paid';
    payment.paymentDate = new Date();
    payment.paymentMethod = 'Development-Simulated';
    payment.razorpayPaymentId = payment.razorpayPaymentId || `devpay_${Date.now()}`;
    payment.razorpaySignature = payment.razorpaySignature || 'dev_signature';
    payment.failureReason = undefined;
    if (!payment.invoiceNumber) {
      payment.invoiceNumber = generateInvoiceNumber();
    }
    await payment.save();

    res.json({ message: 'Invoice marked as paid in development mode', payment });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Student requests manual payment verification (UPI/Cash/Bank)
// @route   POST /api/payments/:id/manual-request
// @access  Private/Student
export const requestManualPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    if (req.user?.role !== Role.STUDENT) {
      res.status(403).json({ message: 'Only students can create manual payment requests' });
      return;
    }

    const payment = await Payment.findOne({ _id: req.params.id, hostelId: tenantId });
    if (!payment) {
      res.status(404).json({ message: 'Payment invoice not found' });
      return;
    }

    if (String(payment.user) !== String(req.user?._id || '')) {
      res.status(403).json({ message: 'Not authorized to update this invoice' });
      return;
    }

    if (payment.status === 'Paid') {
      res.status(400).json({ message: 'This invoice is already paid' });
      return;
    }

    const { mode, amount, transactionRef, proofImageData, note } = req.body as {
      mode: 'UPI' | 'Cash';
      amount: number;
      transactionRef?: string;
      proofImageData: string;
      note?: string;
    };

    if (Number(amount) !== Number(payment.amount)) {
      res.status(400).json({ message: `Amount must exactly match invoice amount: ${payment.amount}` });
      return;
    }

    if (mode === 'UPI' && !transactionRef) {
      res.status(400).json({ message: 'UTR/transaction reference is required for UPI payments' });
      return;
    }

    const payload = payment.gatewayPayload || {};
    payload.manualRequest = {
      mode,
      amount,
      transactionRef: transactionRef || '',
      proofImageData,
      note: note || '',
      requestedAt: new Date().toISOString(),
      requestedBy: String(req.user?._id || ''),
      status: 'Requested',
    };

    payment.gatewayPayload = payload;
    payment.paymentMethod = `Manual-${mode}`;
    payment.status = 'Pending';
    payment.failureReason = undefined;
    await payment.save();

    res.json({ message: 'Manual payment request submitted', payment });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin/Staff reviews manual payment request
// @route   POST /api/payments/:id/manual-review
// @access  Private/Staff
export const reviewManualPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const payment = await Payment.findOne({ _id: req.params.id, hostelId: tenantId });
    if (!payment) {
      res.status(404).json({ message: 'Payment invoice not found' });
      return;
    }

    const { decision, note } = req.body as {
      decision: 'Approve' | 'Reject';
      note?: string;
    };

    const payload = payment.gatewayPayload || {};
    const manualRequest = payload.manualRequest || {};
    if (manualRequest.status !== 'Requested') {
      res.status(400).json({ message: 'No pending manual payment request found for this invoice' });
      return;
    }

    payload.manualReview = {
      decision,
      note: note || '',
      reviewedAt: new Date().toISOString(),
      reviewedBy: String(req.user?._id || ''),
    };

    payload.manualRequest = {
      ...manualRequest,
      status: decision === 'Approve' ? 'Approved' : 'Rejected',
    };

    payment.gatewayPayload = payload;

    if (decision === 'Approve') {
      payment.status = 'Paid';
      payment.paymentDate = new Date();
      payment.failureReason = undefined;
      if (!payment.invoiceNumber) {
        payment.invoiceNumber = generateInvoiceNumber();
      }
    } else {
      payment.status = 'Failed';
      payment.failureReason = note || 'Manual payment request was rejected';
    }

    await payment.save();
    res.json({ message: `Manual payment ${decision.toLowerCase()}d successfully`, payment });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/verify
// @access  Private
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ message: 'Missing required Razorpay verification fields' });
      return;
    }

    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpaySignature;

    if (isAuthentic) {
      const paymentFilter: any = { razorpayOrderId, hostelId: tenantId };
      if (paymentId) {
        paymentFilter._id = paymentId;
      }

      const payment = await Payment.findOne(paymentFilter);
      if (!payment) {
        res.status(404).json({ message: 'Payment record not found' });
        return;
      }

      if (req.user?.role === Role.STUDENT && String(payment.user) !== String(req.user?._id || '')) {
        res.status(403).json({ message: 'Not authorized to verify this payment' });
        return;
      }

      if (payment.status === 'Paid' && payment.razorpayPaymentId === razorpayPaymentId) {
        res.json({ message: 'Payment already verified', payment });
        return;
      }

      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      payment.status = 'Paid';
      payment.paymentDate = new Date();
      payment.failureReason = undefined;
      if (!payment.invoiceNumber) {
        payment.invoiceNumber = generateInvoiceNumber();
      }
      await payment.save();

      res.json({ message: 'Payment verified successfully', payment });
    } else {
      await Payment.updateOne(
        { razorpayOrderId, hostelId: tenantId },
        {
          $set: {
            status: 'Failed',
            failureReason: 'Invalid payment signature',
          },
        }
      );

      res.status(400).json({ message: 'Invalid payment signature' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Razorpay webhook receiver
// @route   POST /api/payments/webhook
// @access  Public (signature verified)
export const handleRazorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = (req.headers['x-razorpay-signature'] as string) || '';

    if (!secret) {
      res.status(500).json({ message: 'Webhook secret is not configured' });
      return;
    }

    const rawBody = (req as any).rawBody as string | Buffer | undefined;
    const payloadString = rawBody
      ? rawBody.toString('utf8')
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});

    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

    if (expectedSignature !== signature) {
      res.status(400).json({ message: 'Invalid webhook signature' });
      return;
    }

    const eventType = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;

    if (!paymentEntity?.order_id) {
      res.status(200).json({ ok: true });
      return;
    }

    const payment = await Payment.findOne({ razorpayOrderId: paymentEntity.order_id });

    if (!payment) {
      res.status(200).json({ ok: true });
      return;
    }

    payment.gatewayPayload = req.body;

    if (eventType === 'payment.captured') {
      payment.status = 'Paid';
      payment.paymentDate = new Date();
      payment.razorpayPaymentId = paymentEntity.id || payment.razorpayPaymentId;
      payment.paymentMethod = paymentEntity.method || payment.paymentMethod;
      payment.failureReason = undefined;
      if (!payment.invoiceNumber) {
        payment.invoiceNumber = generateInvoiceNumber();
      }
      await payment.save();
    }

    if (eventType === 'payment.failed') {
      payment.status = 'Failed';
      payment.paymentMethod = paymentEntity.method || payment.paymentMethod;
      payment.failureReason =
        paymentEntity.error_description || paymentEntity.error_reason || 'Payment failed at gateway';
      await payment.save();
    }

    res.status(200).json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get pending fee list room-wise
// @route   GET /api/payments/pending-roomwise
// @access  Private/Staff
export const getPendingFeesRoomWise = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const rows = await getPendingRoomWiseRows(String(tenantId));
    res.json({
      data: rows,
      total: rows.length,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Payments overview for admin/staff dashboard cards
// @route   GET /api/payments/reports/overview
// @access  Private/Staff
export const getPaymentReportsOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const tenantObjectId = new mongoose.Types.ObjectId(String(tenantId));

    const [
      totalStudents,
      totalPaidAmountAgg,
      totalPaidCount,
      totalPendingCount,
      totalFailedCount,
      totalInvoices,
    ] = await Promise.all([
      User.countDocuments({ hostelId: tenantId, role: Role.STUDENT }),
      Payment.aggregate([
        { $match: { hostelId: tenantObjectId, status: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.countDocuments({ hostelId: tenantId, status: 'Paid' }),
      Payment.countDocuments({ hostelId: tenantId, status: 'Pending' }),
      Payment.countDocuments({ hostelId: tenantId, status: 'Failed' }),
      Payment.countDocuments({ hostelId: tenantId }),
    ]);

    const totalRevenueCollected = Number(totalPaidAmountAgg?.[0]?.total || 0);

    res.json({
      totalStudents,
      totalInvoices,
      totalRevenueCollected,
      paidInvoices: totalPaidCount,
      pendingInvoices: totalPendingCount,
      failedInvoices: totalFailedCount,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export student month-wise fee report (Excel)
// @route   GET /api/payments/reports/student-monthwise/export
// @access  Private/Staff
export const exportStudentMonthWiseReportExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const [students, payments] = await Promise.all([
      User.find({ hostelId: tenantId, role: Role.STUDENT })
        .select('_id registrationId name email phone')
        .sort({ name: 1 })
        .lean(),
      Payment.find({ hostelId: tenantId })
        .select('user amount status billingPeriod createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const feeTypes = Array.from(
      new Set(
        (payments as any[])
          .map((item) => String(item.billingPeriod || '').trim())
          .filter(Boolean)
      )
    ).sort();

    const paymentMapByStudent = new Map<string, any[]>();
    for (const payment of payments as any[]) {
      const key = String(payment.user || '');
      if (!paymentMapByStudent.has(key)) paymentMapByStudent.set(key, []);
      paymentMapByStudent.get(key)?.push(payment);
    }

    const rows = (students as any[]).map((student) => {
      const studentPayments = paymentMapByStudent.get(String(student._id)) || [];
      const byFeeType = new Map<string, any[]>();

      for (const p of studentPayments) {
        const period = String(p.billingPeriod || '').trim();
        if (!period) continue;
        if (!byFeeType.has(period)) byFeeType.set(period, []);
        byFeeType.get(period)?.push(p);
      }

      const base: Record<string, any> = {
        RegistrationId: student.registrationId || '',
        StudentName: student.name || '',
        Email: student.email || '',
        Phone: student.phone || '',
      };

      let totalDue = 0;

      for (const feeType of feeTypes) {
        const entries = byFeeType.get(feeType) || [];
        const hasPaid = entries.some((entry) => entry.status === 'Paid');
        const amount = Number(entries[0]?.amount || 0);

        if (hasPaid) {
          base[formatBillingPeriodLabel(feeType)] = 'Paid';
        } else if (amount > 0) {
          base[formatBillingPeriodLabel(feeType)] = amount;
          totalDue += amount;
        } else {
          base[formatBillingPeriodLabel(feeType)] = '';
        }
      }

      base.TotalAmountDue = totalDue;
      return base;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'StudentFeeReport');

    const fileBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student-month-wise-fee-report.xlsx"');
    res.status(200).send(fileBuffer);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export month-wise revenue collection report (Excel)
// @route   GET /api/payments/reports/revenue-monthwise/export
// @access  Private/Staff
export const exportRevenueMonthWiseReportExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const tenantObjectId = new mongoose.Types.ObjectId(String(tenantId));

    const rowsRaw = await Payment.aggregate([
      { $match: { hostelId: tenantObjectId, status: 'Paid' } },
      {
        $group: {
          _id: '$billingPeriod',
          totalCollected: { $sum: '$amount' },
          paidInvoices: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const rows = rowsRaw.map((row: any) => ({
      BillingPeriod: formatBillingPeriodLabel(String(row._id || 'N/A')),
      TotalCollected: Number(row.totalCollected || 0),
      PaidInvoices: Number(row.paidInvoices || 0),
    }));

    const grandTotal = rows.reduce((sum: number, row: any) => sum + Number(row.TotalCollected || 0), 0);
    rows.push({
      BillingPeriod: 'Grand Total',
      TotalCollected: grandTotal,
      PaidInvoices: rows.reduce((sum: number, row: any) => sum + Number(row.PaidInvoices || 0), 0),
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RevenueMonthWise');

    const fileBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue-month-wise-report.xlsx"');
    res.status(200).send(fileBuffer);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export pending fee list room-wise CSV
// @route   GET /api/payments/pending-roomwise/export
// @access  Private/Staff
export const exportPendingFeesRoomWiseCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const rows = await getPendingRoomWiseRows(String(tenantId));
    const header = ['roomNumber', 'studentName', 'registrationId', 'amount', 'billingPeriod', 'dueDate', 'status'].join(',');

    const csvRows = rows.map((row) =>
      [
        row.roomNumber.replace(/,/g, ' '),
        row.studentName.replace(/,/g, ' '),
        row.registrationId.replace(/,/g, ' '),
        row.amount,
        row.billingPeriod,
        row.dueDate,
        row.status,
      ].join(',')
    );

    const csv = [header, ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pending-fees-room-wise.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get current payments indexes (debug)
// @route   GET /api/payments/debug/indexes
// @access  Private/Admin
export const getPaymentIndexesDebug = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const indexes = await Payment.collection.indexes();
    res.json({
      collection: 'payments',
      indexes,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export payments CSV
// @route   GET /api/payments/export
// @access  Private/Staff
export const exportPaymentsCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const status = String(req.query.status || '').trim();
    const filter: any = { hostelId: tenantId };
    if (status && ['Pending', 'Paid', 'Failed'].includes(status)) {
      filter.status = status;
    }

    const payments = await Payment.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('amount status currency paymentDate invoiceNumber razorpayOrderId createdAt user billingPeriod dueDate')
      .lean();

    const header = [
      'invoiceNumber',
      'studentName',
      'studentEmail',
      'amount',
      'currency',
      'status',
      'billingPeriod',
      'dueDate',
      'paymentDate',
      'razorpayOrderId',
      'createdAt',
    ].join(',');

    const rows = payments.map((payment: any) => {
      const studentName = String(payment.user?.name || '').replace(/,/g, ' ');
      const studentEmail = String(payment.user?.email || '').replace(/,/g, ' ');
      const paymentDate = payment.paymentDate ? new Date(payment.paymentDate).toISOString() : '';
      const createdAt = payment.createdAt ? new Date(payment.createdAt).toISOString() : '';

      return [
        payment.invoiceNumber || '',
        studentName,
        studentEmail,
        payment.amount,
        payment.currency || 'INR',
        payment.status || 'Pending',
        payment.billingPeriod || '',
        payment.dueDate ? new Date(payment.dueDate).toISOString() : '',
        paymentDate,
        payment.razorpayOrderId || '',
        createdAt,
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download payment invoice PDF
// @route   GET /api/payments/:id/invoice
// @access  Private
export const downloadPaymentInvoicePdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const payment: any = await Payment.findOne({ _id: req.params.id, hostelId: tenantId })
      .populate('user', 'name email')
      .populate('booking', 'startDate endDate')
      .lean();

    if (!payment) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }

    if (req.user?.role === Role.STUDENT && String(payment.user?._id || '') !== String(req.user?._id || '')) {
      res.status(403).json({ message: 'Not authorized to access this invoice' });
      return;
    }

    if (payment.status !== 'Paid') {
      res.status(400).json({ message: 'Invoice PDF is available only for paid payments' });
      return;
    }

    const paidAt = payment.paymentDate ? new Date(payment.paymentDate).toLocaleString('en-IN') : 'N/A';
    const createdAt = payment.createdAt ? new Date(payment.createdAt).toLocaleString('en-IN') : 'N/A';

    const lines = [
      'HostelHub - Payment Invoice',
      '----------------------------------------',
      `Invoice No: ${payment.invoiceNumber || 'N/A'}`,
      `Payment Id: ${payment.razorpayPaymentId || 'N/A'}`,
      `Order Id: ${payment.razorpayOrderId || 'N/A'}`,
      `Student: ${payment.user?.name || 'N/A'}`,
      `Email: ${payment.user?.email || 'N/A'}`,
      `Amount: INR ${payment.amount}`,
      `Fee Month: ${payment.billingPeriod || 'N/A'}`,
      `Status: ${payment.status}`,
      `Method: ${payment.paymentMethod || 'N/A'}`,
      `Paid At: ${paidAt}`,
      `Created At: ${createdAt}`,
      '',
      'This is a system-generated invoice by HostelHub.',
    ];

    const pdfBuffer = generateSimpleInvoicePdf(lines);
    const fileName = `${payment.invoiceNumber || `invoice-${payment._id}`}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
