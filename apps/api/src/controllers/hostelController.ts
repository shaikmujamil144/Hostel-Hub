import { Request, Response } from 'express';
import { Hostel, SubscriptionPlan } from '../models/Hostel';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { Notification } from '../models/Notification';
import { Payment } from '../models/Payment';
import { Room } from '../models/Room';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { getEscalationWindowHours, getMaxEscalationLevel, getSlaHours } from '../services/slaPolicyService';
import { logAuditEvent } from '../services/auditService';

const buildRoomSeedFromFloors = (
  hostelId: string,
  floors: Array<{ floorNumber: number; rooms: Array<{ roomLabel: string; beds: number }> }>
) => {
  const seed: Array<any> = [];
  for (const floor of floors || []) {
    for (const room of floor.rooms || []) {
      const roomNumber = String(room.roomLabel || '').trim();
      if (!roomNumber) continue;
      const capacity = Math.max(1, Number(room.beds || 1));
      seed.push({
        hostelId,
        roomNumber,
        capacity,
        currentOccupancy: 0,
        type: 'Non-AC',
        monthlyRent: 0,
      });
    }
  }
  return seed;
};

const syncRoomsFromFloors = async (
  hostelId: string,
  floors: Array<{ floorNumber: number; rooms: Array<{ roomLabel: string; beds: number }> }>
) => {
  const roomSeed = buildRoomSeedFromFloors(hostelId, floors);
  if (roomSeed.length === 0) return;

  const existingRooms = await Room.find({ hostelId, roomNumber: { $in: roomSeed.map((r) => r.roomNumber) } })
    .select('_id roomNumber currentOccupancy')
    .lean();
  const existingMap = new Map(existingRooms.map((room: any) => [String(room.roomNumber), room]));

  const inserts: any[] = [];
  const updates: any[] = [];

  for (const seed of roomSeed) {
    const existing = existingMap.get(seed.roomNumber);
    if (!existing) {
      inserts.push(seed);
      continue;
    }

    const adjustedCapacity = Math.max(seed.capacity, Number(existing.currentOccupancy || 0));
    updates.push({
      updateOne: {
        filter: { _id: existing._id },
        update: {
          $set: {
            capacity: adjustedCapacity,
          },
        },
      },
    });
  }

  if (inserts.length > 0) {
    await Room.insertMany(inserts, { ordered: false });
  }

  if (updates.length > 0) {
    await Room.bulkWrite(updates, { ordered: false });
  }
};

const getTenantIdFromRequest = (req: Request): string | null => {
  return req.tenantId ? String(req.tenantId) : null;
};

export const getCurrentHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const hostel = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } })
      .select('_id name subscriptionPlan isActive createdAt updatedAt')
      .lean();

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    res.json(hostel);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCurrentHostelPaymentSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const hostel: any = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } })
      .select('_id name paymentSettings')
      .lean();

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    res.json({
      hostelId: hostel._id,
      hostelName: hostel.name,
      paymentSettings: hostel.paymentSettings || {},
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getCurrentHostelSlaPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const hostel = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } }).select('_id name subscriptionPlan');
    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    const plan = (hostel.subscriptionPlan || SubscriptionPlan.BASIC) as SubscriptionPlan;

    res.json({
      hostelId: hostel._id,
      hostelName: hostel.name,
      subscriptionPlan: plan,
      slaHoursByPriority: {
        Low: getSlaHours(plan, 'Low'),
        Medium: getSlaHours(plan, 'Medium'),
        High: getSlaHours(plan, 'High'),
      },
      escalation: {
        windowHours: getEscalationWindowHours(plan),
        maxLevel: getMaxEscalationLevel(plan),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCurrentHostelPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const nextPlan = req.body.subscriptionPlan as SubscriptionPlan;

    const hostel = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } });
    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    const previousPlan = hostel.subscriptionPlan;
    if (previousPlan === nextPlan) {
      res.json({
        message: 'Plan unchanged',
        hostel: {
          _id: hostel._id,
          name: hostel.name,
          subscriptionPlan: hostel.subscriptionPlan,
        },
      });
      return;
    }

    hostel.subscriptionPlan = nextPlan;
    await hostel.save();

    await logAuditEvent({
      actorId: req.user ? String(req.user._id) : undefined,
      action: 'HOSTEL_PLAN_UPDATED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId,
      metadata: {
        previousPlan,
        nextPlan,
      },
    });

    res.json({
      message: 'Hostel subscription plan updated',
      hostel: {
        _id: hostel._id,
        name: hostel.name,
        subscriptionPlan: hostel.subscriptionPlan,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCurrentHostelPaymentSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const hostel = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } });
    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    const { upiId, upiDisplayName, upiQrImageData } = req.body as {
      upiId?: string;
      upiDisplayName?: string;
      upiQrImageData?: string;
    };

    const existing = hostel.paymentSettings || {};
    hostel.paymentSettings = {
      upiId: typeof upiId === 'string' ? upiId.trim() : existing.upiId,
      upiDisplayName: typeof upiDisplayName === 'string' ? upiDisplayName.trim() : existing.upiDisplayName,
      upiQrImageData: typeof upiQrImageData === 'string' ? upiQrImageData : existing.upiQrImageData,
    };

    await hostel.save();

    await logAuditEvent({
      actorId: req.user ? String(req.user._id) : undefined,
      action: 'HOSTEL_PAYMENT_SETTINGS_UPDATED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId,
      metadata: {
        hasUpiId: Boolean(hostel.paymentSettings?.upiId),
        hasQrImage: Boolean(hostel.paymentSettings?.upiQrImageData),
      },
    });

    res.json({
      message: 'Payment settings updated',
      paymentSettings: hostel.paymentSettings || {},
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { name, subscriptionPlan, floors, referenceImages } = req.body as {
      name: string;
      subscriptionPlan?: SubscriptionPlan;
      floors: Array<{
        floorNumber: number;
        rooms: Array<{
          roomLabel: string;
          beds: number;
        }>;
      }>;
      referenceImages?: string[];
    };

    const normalizedFloors = (floors || []).map((floor) => ({
      floorNumber: floor.floorNumber,
      rooms: (floor.rooms || []).map((room) => ({
        roomLabel: String(room.roomLabel || '').trim(),
        beds: Number(room.beds || 0),
      })),
    }));

    const floorsCount = normalizedFloors.length;
    const totalRooms = normalizedFloors.reduce((sum, floor) => sum + floor.rooms.length, 0);
    const totalBeds = normalizedFloors.reduce(
      (sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + room.beds, 0),
      0
    );

    const hostel = await Hostel.create({
      name: String(name).trim(),
      ownerId: req.user._id,
      subscriptionPlan: subscriptionPlan || SubscriptionPlan.BASIC,
      floorsCount,
      totalRooms,
      totalBeds,
      floors: normalizedFloors,
      referenceImages: (referenceImages || []).slice(0, 8),
      isActive: true,
      isDeleted: false,
    });

    await syncRoomsFromFloors(String(hostel._id), normalizedFloors);

    await logAuditEvent({
      actorId: String(req.user._id),
      action: 'HOSTEL_CREATED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId: req.tenantId,
      metadata: {
        name: hostel.name,
        floorsCount,
        totalRooms,
        totalBeds,
      },
    });

    res.status(201).json({
      message: 'Hostel created successfully',
      hostel,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getOwnedHostels = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostels = await Hostel.find({ ownerId: req.user._id, isDeleted: { $ne: true } })
      .select('_id name subscriptionPlan floorsCount totalRooms totalBeds referenceImages createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      total: hostels.length,
      items: hostels,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getOwnedHostelById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostelId = String(req.params.id || '');
    const hostel = await Hostel.findOne({
      _id: hostelId,
      ownerId: req.user._id,
      isDeleted: { $ne: true },
    }).lean();

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    res.json(hostel);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOwnedHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostelId = String(req.params.id || '');
    const { name, subscriptionPlan, floors, referenceImages } = req.body as {
      name: string;
      subscriptionPlan?: SubscriptionPlan;
      floors: Array<{ floorNumber: number; rooms: Array<{ roomLabel: string; beds: number }> }>;
      referenceImages?: string[];
    };

    const hostel = await Hostel.findOne({
      _id: hostelId,
      ownerId: req.user._id,
      isDeleted: { $ne: true },
    });

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    const normalizedFloors = (floors || []).map((floor) => ({
      floorNumber: floor.floorNumber,
      rooms: (floor.rooms || []).map((room) => ({
        roomLabel: String(room.roomLabel || '').trim(),
        beds: Math.max(1, Number(room.beds || 1)),
      })),
    }));

    hostel.name = String(name).trim();
    hostel.subscriptionPlan = subscriptionPlan || hostel.subscriptionPlan;
    hostel.floors = normalizedFloors;
    hostel.floorsCount = normalizedFloors.length;
    hostel.totalRooms = normalizedFloors.reduce((sum, floor) => sum + floor.rooms.length, 0);
    hostel.totalBeds = normalizedFloors.reduce(
      (sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + room.beds, 0),
      0
    );
    hostel.referenceImages = (referenceImages || []).slice(0, 8);

    await hostel.save();
    await syncRoomsFromFloors(String(hostel._id), normalizedFloors);

    await logAuditEvent({
      actorId: String(req.user._id),
      action: 'HOSTEL_UPDATED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId: req.tenantId,
      metadata: {
        name: hostel.name,
        floorsCount: hostel.floorsCount,
        totalRooms: hostel.totalRooms,
        totalBeds: hostel.totalBeds,
      },
    });

    res.json({ message: 'Hostel updated successfully', hostel });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const softDeleteOwnedHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostelId = String(req.params.id || '');

    const hostel = await Hostel.findOne({
      _id: hostelId,
      ownerId: req.user._id,
      isDeleted: { $ne: true },
    });

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found' });
      return;
    }

    hostel.isDeleted = true;
    hostel.isActive = false;
    hostel.deletedAt = new Date();
    hostel.deletedBy = req.user._id;
    await hostel.save();

    await logAuditEvent({
      actorId: String(req.user._id),
      action: 'HOSTEL_SOFT_DELETED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId: req.tenantId,
      metadata: {
        name: hostel.name,
      },
    });

    res.json({ message: 'Hostel moved to recycle bin' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDeletedOwnedHostels = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostels = await Hostel.find({ ownerId: req.user._id, isDeleted: true })
      .select('_id name subscriptionPlan floorsCount totalRooms totalBeds referenceImages deletedAt updatedAt')
      .sort({ deletedAt: -1 })
      .lean();

    res.json({
      total: hostels.length,
      items: hostels,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const restoreOwnedHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostelId = String(req.params.id || '');

    const hostel = await Hostel.findOne({
      _id: hostelId,
      ownerId: req.user._id,
      isDeleted: true,
    });

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found in recycle bin' });
      return;
    }

    hostel.isDeleted = false;
    hostel.isActive = true;
    hostel.deletedAt = undefined;
    hostel.deletedBy = undefined;
    await hostel.save();

    await logAuditEvent({
      actorId: String(req.user._id),
      action: 'HOSTEL_RESTORED',
      entityType: 'Hostel',
      entityId: String(hostel._id),
      tenantId: req.tenantId,
      metadata: {
        name: hostel.name,
      },
    });

    res.json({ message: 'Hostel restored successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const permanentlyDeleteOwnedHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?._id) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const hostelId = String(req.params.id || '');

    const hostel = await Hostel.findOne({
      _id: hostelId,
      ownerId: req.user._id,
      isDeleted: true,
    });

    if (!hostel) {
      res.status(404).json({ message: 'Hostel not found in recycle bin' });
      return;
    }

    await Promise.all([
      User.deleteMany({ hostelId }),
      Room.deleteMany({ hostelId }),
      Booking.deleteMany({ hostelId }),
      Complaint.deleteMany({ hostelId }),
      Payment.deleteMany({ hostelId }),
      Notification.deleteMany({ hostelId }),
      AuditLog.deleteMany({ tenantId: hostelId }),
      Hostel.deleteOne({ _id: hostel._id }),
    ]);

    await logAuditEvent({
      actorId: String(req.user._id),
      action: 'HOSTEL_PERMANENTLY_DELETED',
      entityType: 'Hostel',
      entityId: hostelId,
      tenantId: req.tenantId,
      metadata: {
        name: hostel.name,
      },
    });

    res.json({ message: 'Hostel permanently deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
