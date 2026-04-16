import { Request, Response } from 'express';
import { Booking } from '../models/Booking';
import { Room } from '../models/Room';
import { User, Role } from '../models/User';
import { Payment } from '../models/Payment';
import { logAuditEvent } from '../services/auditService';
import mongoose from 'mongoose';
import { createTenantNotification } from '../services/notificationService';
import { NotificationType } from '../models/Notification';
import { paginationMeta, parsePagination } from '../utils/pagination';

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private/Staff
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  let session: mongoose.ClientSession | null = null;

  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { user, room, startDate } = req.body;

    session = await mongoose.startSession();

    let booking: any;
    let paymentInitialized = false;

    await session.withTransaction(async () => {
      const [roomDetails, student] = await Promise.all([
        Room.findOne({ _id: room, hostelId: tenantId }).session(session),
        User.findOne({ _id: user, hostelId: tenantId, role: Role.STUDENT }).session(session),
      ]);

      if (!roomDetails) {
        throw new Error('ROOM_NOT_FOUND');
      }

      if (!student) {
        throw new Error('STUDENT_NOT_FOUND');
      }

      if (roomDetails.currentOccupancy >= roomDetails.capacity) {
        throw new Error('ROOM_FULL');
      }

      const existingActiveBooking = await Booking.findOne({
        hostelId: tenantId,
        user,
        status: 'Active',
      }).session(session);

      if (existingActiveBooking) {
        throw new Error('ACTIVE_BOOKING_EXISTS');
      }

      roomDetails.currentOccupancy += 1;
      await roomDetails.save({ session });

      const bookings = await Booking.create(
        [
          {
            hostelId: tenantId,
            user,
            room,
            startDate,
          },
        ],
        { session }
      );

      booking = bookings[0];

      if (Number(roomDetails.monthlyRent || 0) > 0) {
        const bookingStart = new Date(startDate || new Date());
        const billingYear = bookingStart.getFullYear();
        const billingMonth = bookingStart.getMonth() + 1;
        const billingPeriod = `${billingYear}-${String(billingMonth).padStart(2, '0')}`;
        const dueDate = new Date(billingYear, bookingStart.getMonth(), 10);

        await Payment.create(
          [
            {
              hostelId: tenantId,
              user,
              booking: booking._id,
              amount: Number(roomDetails.monthlyRent || 0),
              billingYear,
              billingMonth,
              billingPeriod,
              dueDate,
              status: 'Pending',
            },
          ],
          { session }
        );
        paymentInitialized = true;
      }
    });

    await logAuditEvent({
      actorId: req.user?._id?.toString(),
      action: 'CREATE_BOOKING',
      entityType: 'Booking',
      entityId: String(booking._id),
      tenantId: req.tenantId,
      metadata: { roomId: String(room), userId: String(user) },
    });

    await createTenantNotification({
      tenantId,
      type: NotificationType.BOOKING_CREATED,
      title: 'New room booking created',
      message: `A new booking was created for room ${String(room)}`,
      entityType: 'Booking',
      entityId: String(booking._id),
      recipientUserId: String(user),
    });

    res.status(201).json({
      booking,
      paymentInitialized,
    });
  } catch (error: any) {
    if (error?.message === 'ROOM_NOT_FOUND') {
      res.status(404).json({ message: 'Room not found' });
      return;
    }

    if (error?.message === 'STUDENT_NOT_FOUND') {
      res.status(404).json({ message: 'Student not found' });
      return;
    }

    if (error?.message === 'ROOM_FULL') {
      res.status(400).json({ message: 'Room is fully occupied' });
      return;
    }

    if (error?.message === 'ACTIVE_BOOKING_EXISTS') {
      res.status(400).json({ message: 'Student already has an active booking' });
      return;
    }

    res.status(500).json({ message: error.message });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// @desc    Get students who do not have an active room allocation
// @route   GET /api/bookings/unallocated-students
// @access  Private/Staff
export const getUnallocatedStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const search = String(req.query.search || '').trim();

    const activeBookings = await Booking.find({
      hostelId: tenantId,
      status: 'Active',
    })
      .select('user')
      .lean();

    const allocatedUserIds = activeBookings.map((booking: any) => booking.user).filter(Boolean);

    const filter: any = {
      hostelId: tenantId,
      role: Role.STUDENT,
      _id: { $nin: allocatedUserIds },
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { registrationId: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await User.find(filter)
      .select('name email registrationId')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    res.json({
      data: students,
      total: students.length,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private/Staff
export const getBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const status = String(req.query.status || '').trim();

    const filter: any = { hostelId: tenantId };
    if (status && ['Active', 'Completed', 'Cancelled'].includes(status)) {
      filter.status = status;
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('user', 'name email')
        .populate('room', 'roomNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({
      data: bookings,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
