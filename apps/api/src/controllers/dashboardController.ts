import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import { Room } from '../models/Room';
import { Payment } from '../models/Payment';
import { Complaint } from '../models/Complaint';
import { Hostel } from '../models/Hostel';
import { Booking } from '../models/Booking';
import mongoose from 'mongoose';

const DASHBOARD_CACHE_TTL_MS = 30 * 1000;
const dashboardCache = new Map<string, { expiresAt: number; payload: any }>();

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const refresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const cacheKey = String(tenantId);
    const cached = dashboardCache.get(cacheKey);

    if (!refresh && cached && cached.expiresAt > Date.now()) {
      res.json(cached.payload);
      return;
    }

    const [students, rooms, emptyRooms, payments, activeComplaints, resolvedComplaints, unresolvedComplaints, occupancy] = await Promise.all([
      User.countDocuments({ role: Role.STUDENT, hostelId: tenantId }),
      Room.countDocuments({ hostelId: tenantId }),
      Room.countDocuments({ hostelId: tenantId, currentOccupancy: 0 }),
      Payment.aggregate([
        { $match: { hostelId: tenantId, status: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Complaint.countDocuments({ hostelId: tenantId, status: { $in: ['Open', 'InProgress'] } }),
      Complaint.countDocuments({ hostelId: tenantId, status: 'Resolved' }),
      Complaint.countDocuments({ hostelId: tenantId, status: { $ne: 'Resolved' } }),
      Room.aggregate([
        { $match: { hostelId: tenantId } },
        {
          $group: {
            _id: null,
            capacity: { $sum: '$capacity' },
            occupied: { $sum: '$currentOccupancy' },
          },
        },
      ]),
    ]);

    const revenue = payments[0]?.total || 0;
    const totalCapacity = occupancy[0]?.capacity || 0;
    const occupied = occupancy[0]?.occupied || 0;
    const emptyBeds = Math.max(0, totalCapacity - occupied);
    const occupancyRate = totalCapacity > 0 ? Math.round((occupied / totalCapacity) * 100) : 0;

    const payload = {
      students,
      rooms,
      emptyRooms,
      revenue,
      complaints: activeComplaints,
      resolvedComplaints,
      unresolvedComplaints,
      totalBeds: totalCapacity,
      occupiedBeds: occupied,
      emptyBeds,
      occupancyRate,
    };

    dashboardCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      payload,
    });

    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      res.status(400).json({ message: 'Invalid tenant context' });
      return;
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const months = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString('en-US', { month: 'short' }),
      };
    });

    const [revenueRows, complaintRows, roomTypeRows, complaintPriorityRows, slaRows] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            hostelId: tenantObjectId,
            status: 'Paid',
            paymentDate: { $gte: startMonth },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' },
            },
            totalAmount: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          },
        },
      ]),
      Complaint.aggregate([
        {
          $match: {
            hostelId: tenantObjectId,
            createdAt: { $gte: startMonth },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Room.aggregate([
        { $match: { hostelId: tenantObjectId } },
        {
          $group: {
            _id: '$type',
            rooms: { $sum: 1 },
            capacity: { $sum: '$capacity' },
            occupied: { $sum: '$currentOccupancy' },
          },
        },
      ]),
      Complaint.aggregate([
        {
          $match: {
            hostelId: tenantObjectId,
          },
        },
        {
          $group: {
            _id: '$priorityLabel',
            count: { $sum: 1 },
          },
        },
      ]),
      Complaint.aggregate([
        {
          $match: {
            hostelId: tenantObjectId,
          },
        },
        {
          $group: {
            _id: null,
            totalActive: {
              $sum: {
                $cond: [{ $in: ['$status', ['Open', 'InProgress']] }, 1, 0],
              },
            },
            overdueActive: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ['$status', ['Open', 'InProgress']] },
                      { $lt: ['$slaDueAt', now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            resolvedTotal: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0],
              },
            },
            resolvedWithinSla: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 'Resolved'] },
                      { $ne: ['$resolvedAt', null] },
                      { $lte: ['$resolvedAt', '$slaDueAt'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const revenueByMonth = months.map((m) => {
      const match = revenueRows.find((r: any) => r._id?.year === m.year && r._id?.month === m.month);
      return {
        month: m.label,
        totalAmount: match?.totalAmount || 0,
        paymentCount: match?.paymentCount || 0,
      };
    });

    const complaintsByMonth = months.map((m) => {
      const match = complaintRows.find((r: any) => r._id?.year === m.year && r._id?.month === m.month);
      return {
        month: m.label,
        count: match?.count || 0,
      };
    });

    const recentComplaintCounts = complaintsByMonth.map((m) => m.count);
    const lastThree = recentComplaintCounts.slice(-3);
    const weightedAverage =
      lastThree.length > 0
        ? lastThree.reduce((sum, value, idx) => sum + value * (idx + 1), 0) /
          lastThree.reduce((sum, _value, idx) => sum + (idx + 1), 0)
        : 0;
    const momentum =
      recentComplaintCounts.length >= 2
        ? recentComplaintCounts[recentComplaintCounts.length - 1] - recentComplaintCounts[recentComplaintCounts.length - 2]
        : 0;
    const complaintForecastNextMonth = Math.max(0, Math.round(weightedAverage + momentum * 0.5));

    const roomTypeSplit = roomTypeRows.map((row: any) => ({
      type: row._id || 'Unknown',
      rooms: row.rooms || 0,
      capacity: row.capacity || 0,
      occupied: row.occupied || 0,
      occupancyRate: row.capacity > 0 ? Math.round((row.occupied / row.capacity) * 100) : 0,
    }));

    const defaultPriority = { Low: 0, Medium: 0, High: 0 } as Record<string, number>;
    for (const row of complaintPriorityRows) {
      const key = String(row?._id || 'Low');
      if (Object.prototype.hasOwnProperty.call(defaultPriority, key)) {
        defaultPriority[key] = row?.count || 0;
      }
    }

    const complaintPrioritySplit = [
      { label: 'Low', count: defaultPriority.Low },
      { label: 'Medium', count: defaultPriority.Medium },
      { label: 'High', count: defaultPriority.High },
    ];

    const slaAgg = slaRows[0] || {
      totalActive: 0,
      overdueActive: 0,
      resolvedTotal: 0,
      resolvedWithinSla: 0,
    };

    const resolvedWithinSlaRate =
      slaAgg.resolvedTotal > 0
        ? Math.round((slaAgg.resolvedWithinSla / slaAgg.resolvedTotal) * 100)
        : 0;

    res.json({
      revenueByMonth,
      complaintsByMonth,
      complaintForecastNextMonth,
      roomTypeSplit,
      complaintPrioritySplit,
      slaMetrics: {
        totalActive: slaAgg.totalActive,
        overdueActive: slaAgg.overdueActive,
        resolvedTotal: slaAgg.resolvedTotal,
        resolvedWithinSla: slaAgg.resolvedWithinSla,
        resolvedWithinSlaRate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getOwnerNetworkAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?._id || !user?.email || user?.role !== Role.ADMIN) {
      res.status(403).json({ message: 'Only admin users can access network analytics' });
      return;
    }

    const adminAccounts = await User.find({
      email: user.email,
      role: Role.ADMIN,
    })
      .select('hostelId')
      .lean();

    const hostelIds = Array.from(
      new Set(
        adminAccounts
          .map((entry: any) => String(entry.hostelId))
          .filter((value: string) => mongoose.Types.ObjectId.isValid(value))
      )
    ).map((id) => new mongoose.Types.ObjectId(id));

    if (hostelIds.length === 0) {
      res.json({
        hostels: 0,
        students: 0,
        rooms: 0,
        revenue: 0,
        activeComplaints: 0,
        hostelsBreakdown: [],
      });
      return;
    }

    const [hostels, students, rooms, revenueRows, complaints, breakdownRows] = await Promise.all([
      Hostel.find({ _id: { $in: hostelIds }, isActive: true })
        .select('_id name subscriptionPlan')
        .lean(),
      User.countDocuments({ hostelId: { $in: hostelIds }, role: Role.STUDENT }),
      Room.countDocuments({ hostelId: { $in: hostelIds } }),
      Payment.aggregate([
        {
          $match: {
            hostelId: { $in: hostelIds },
            status: 'Paid',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),
      Complaint.countDocuments({
        hostelId: { $in: hostelIds },
        status: { $in: ['Open', 'InProgress'] },
      }),
      Hostel.aggregate([
        { $match: { _id: { $in: hostelIds }, isActive: true } },
        {
          $lookup: {
            from: 'users',
            let: { hid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$hostelId', '$$hid'] },
                      { $eq: ['$role', Role.STUDENT] },
                    ],
                  },
                },
              },
              { $count: 'count' },
            ],
            as: 'studentsAgg',
          },
        },
        {
          $lookup: {
            from: 'rooms',
            let: { hid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$hostelId', '$$hid'],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  rooms: { $sum: 1 },
                  capacity: { $sum: '$capacity' },
                  occupied: { $sum: '$currentOccupancy' },
                },
              },
            ],
            as: 'roomsAgg',
          },
        },
        {
          $lookup: {
            from: 'payments',
            let: { hid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$hostelId', '$$hid'] },
                      { $eq: ['$status', 'Paid'] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  revenue: { $sum: '$amount' },
                },
              },
            ],
            as: 'paymentsAgg',
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            subscriptionPlan: 1,
            students: { $ifNull: [{ $arrayElemAt: ['$studentsAgg.count', 0] }, 0] },
            rooms: { $ifNull: [{ $arrayElemAt: ['$roomsAgg.rooms', 0] }, 0] },
            capacity: { $ifNull: [{ $arrayElemAt: ['$roomsAgg.capacity', 0] }, 0] },
            occupied: { $ifNull: [{ $arrayElemAt: ['$roomsAgg.occupied', 0] }, 0] },
            revenue: { $ifNull: [{ $arrayElemAt: ['$paymentsAgg.revenue', 0] }, 0] },
          },
        },
      ]),
    ]);

    res.json({
      hostels: hostels.length,
      students,
      rooms,
      revenue: revenueRows[0]?.total || 0,
      activeComplaints: complaints,
      hostelsBreakdown: breakdownRows.map((row: any) => ({
        _id: row._id,
        name: row.name,
        subscriptionPlan: row.subscriptionPlan,
        students: row.students,
        rooms: row.rooms,
        occupancyRate: row.capacity > 0 ? Math.round((row.occupied / row.capacity) * 100) : 0,
        revenue: row.revenue,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentDashboardSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    const user = (req as any).user;

    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    if (!user?._id || user?.role !== Role.STUDENT) {
      res.status(403).json({ message: 'Only students can access this dashboard' });
      return;
    }

    const [activeBooking, paymentAgg, complaintsAgg, recentComplaints, recentPayments] = await Promise.all([
      Booking.findOne({ hostelId: tenantId, user: user._id, status: 'Active' })
        .populate('room', 'roomNumber type capacity currentOccupancy monthlyRent')
        .lean(),
      Payment.aggregate([
        {
          $match: {
            hostelId: new mongoose.Types.ObjectId(String(tenantId)),
            user: new mongoose.Types.ObjectId(String(user._id)),
          },
        },
        {
          $group: {
            _id: null,
            pendingAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Pending'] }, '$amount', 0],
              },
            },
            paidAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Paid'] }, '$amount', 0],
              },
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0],
              },
            },
          },
        },
      ]),
      Complaint.aggregate([
        {
          $match: {
            hostelId: new mongoose.Types.ObjectId(String(tenantId)),
            user: new mongoose.Types.ObjectId(String(user._id)),
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Complaint.find({ hostelId: tenantId, user: user._id })
        .select('title status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Payment.find({
        hostelId: tenantId,
        user: user._id,
      })
        .select('amount status paymentDate createdAt invoiceNumber billingPeriod dueDate')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const room = (activeBooking as any)?.room;
    const hasRoom = Boolean(activeBooking && room);

    let roommates: Array<{ _id: string; name: string; email: string }> = [];
    if (hasRoom) {
      const roomBookings = await Booking.find({
        hostelId: tenantId,
        room: (activeBooking as any).room?._id,
        status: 'Active',
      })
        .populate('user', 'name email')
        .lean();

      roommates = roomBookings
        .map((booking: any) => booking.user)
        .filter((mate: any) => mate && String(mate._id) !== String(user._id))
        .map((mate: any) => ({
          _id: String(mate._id),
          name: String(mate.name || ''),
          email: String(mate.email || ''),
        }));
    }

    const complaintCountMap = { Open: 0, InProgress: 0, Resolved: 0 } as Record<string, number>;
    for (const row of complaintsAgg) {
      const key = String((row as any)?._id || 'Open');
      if (Object.prototype.hasOwnProperty.call(complaintCountMap, key)) {
        complaintCountMap[key] = Number((row as any)?.count || 0);
      }
    }

    const paymentSummary = paymentAgg[0] || {
      pendingAmount: 0,
      paidAmount: 0,
      pendingCount: 0,
    };

    res.json({
      student: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        registrationId: user.registrationId,
      },
      room: hasRoom
        ? {
            roomNumber: room.roomNumber,
            type: room.type,
            capacity: room.capacity,
            currentOccupancy: room.currentOccupancy,
            monthlyRent: room.monthlyRent,
            availableBeds: Math.max(0, Number(room.capacity || 0) - Number(room.currentOccupancy || 0)),
          }
        : null,
      roommates,
      payments: {
        pendingAmount: Number(paymentSummary.pendingAmount || 0),
        paidAmount: Number(paymentSummary.paidAmount || 0),
        pendingCount: Number(paymentSummary.pendingCount || 0),
      },
      recentPayments: recentPayments.map((payment: any) => ({
        _id: String(payment._id),
        amount: Number(payment.amount || 0),
        status: String(payment.status || 'Pending'),
        billingPeriod: String(payment.billingPeriod || ''),
        dueDate: payment.dueDate || null,
        paymentDate: payment.paymentDate || payment.createdAt,
        invoiceNumber: payment.invoiceNumber,
      })),
      complaints: {
        open: complaintCountMap.Open,
        inProgress: complaintCountMap.InProgress,
        resolved: complaintCountMap.Resolved,
      },
      recentComplaints,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
