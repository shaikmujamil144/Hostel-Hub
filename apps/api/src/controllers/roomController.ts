import { Request, Response } from 'express';
import { Room } from '../models/Room';
import { Booking } from '../models/Booking';
import { Hostel } from '../models/Hostel';
import { logAuditEvent } from '../services/auditService';
import { paginationMeta, parsePagination } from '../utils/pagination';

const buildSeedFromHostelLayout = (tenantId: string, hostel: any) => {
  const floorRooms = Array.isArray(hostel?.floors)
    ? hostel.floors.flatMap((floor: any) =>
        Array.isArray(floor?.rooms)
          ? floor.rooms.map((room: any) => ({
              roomNumber: String(room?.roomLabel || '').trim(),
              capacity: Math.max(1, Number(room?.beds || 1)),
            }))
          : []
      )
    : [];

  return floorRooms
    .filter((room: any) => room.roomNumber)
    .map((room: any) => ({
      hostelId: tenantId,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: 0,
      type: 'Non-AC',
      monthlyRent: 0,
    }));
};

const syncRoomsFromHostelLayout = async (tenantId: string) => {
  const hostel: any = await Hostel.findOne({ _id: tenantId, isDeleted: { $ne: true } })
    .select('floors')
    .lean();

  const seed = buildSeedFromHostelLayout(tenantId, hostel);
  if (seed.length === 0) {
    return { createdOrUpdated: 0 };
  }

  const operations = seed.map((room: any) => ({
    updateOne: {
      filter: { hostelId: tenantId, roomNumber: room.roomNumber },
      update: {
        $setOnInsert: {
          hostelId: room.hostelId,
          roomNumber: room.roomNumber,
          currentOccupancy: 0,
          type: 'Non-AC',
          monthlyRent: 0,
        },
        $max: {
          capacity: room.capacity,
        },
      },
      upsert: true,
    },
  }));

  const result = await Room.bulkWrite(operations, { ordered: false });
  const createdOrUpdated =
    Number((result as any)?.upsertedCount || 0) +
    Number((result as any)?.modifiedCount || 0) +
    Number((result as any)?.matchedCount || 0);

  return { createdOrUpdated };
};

// @desc    Get all rooms
// @route   GET /api/rooms
// @access  Private
export const getRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const search = String(req.query.search || '').trim();

    const filter: any = { hostelId: tenantId };
    if (search) {
      filter.$or = [{ roomNumber: { $regex: search, $options: 'i' } }, { type: search }];
    }

    let [rooms, total] = await Promise.all([
      Room.find(filter).sort({ roomNumber: 1 }).skip(skip).limit(limit).lean(),
      Room.countDocuments(filter),
    ]);

    // Backward compatibility: seed Room documents from hostel floor layout if not present yet.
    if (total === 0 && !search && page === 1) {
      await syncRoomsFromHostelLayout(tenantId);
      [rooms, total] = await Promise.all([
        Room.find(filter).sort({ roomNumber: 1 }).skip(skip).limit(limit).lean(),
        Room.countDocuments(filter),
      ]);
    }

    res.json({
      data: rooms,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a room
// @route   POST /api/rooms
// @access  Private/Admin
export const createRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { roomNumber, capacity, type, monthlyRent } = req.body;
    
    const roomExists = await Room.findOne({ hostelId: tenantId, roomNumber });
    if (roomExists) {
      res.status(400).json({ message: 'Room already exists' });
      return;
    }

    const room = await Room.create({
      hostelId: tenantId,
      roomNumber,
      capacity,
      type,
      monthlyRent,
    });

    await logAuditEvent({
      actorId: req.user?._id?.toString(),
      action: 'CREATE_ROOM',
      entityType: 'Room',
      entityId: String(room._id),
      tenantId: req.tenantId,
    });

    res.status(201).json(room);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sync room cards from hostel floor layout
// @route   POST /api/rooms/sync-from-hostel
// @access  Private/Admin
export const syncRoomsFromHostel = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const result = await syncRoomsFromHostelLayout(tenantId);
    const total = await Room.countDocuments({ hostelId: tenantId });

    res.json({
      message: 'Room cards synced from hostel layout',
      processed: result.createdOrUpdated,
      totalRooms: total,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get room details with active students
// @route   GET /api/rooms/:id
// @access  Private/Admin
export const getRoomDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const room: any = await Room.findOne({ _id: req.params.id, hostelId: tenantId }).lean();
    if (!room) {
      res.status(404).json({ message: 'Room not found' });
      return;
    }

    const activeBookings = await Booking.find({
      hostelId: tenantId,
      room: room._id,
      status: 'Active',
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const students = activeBookings
      .map((booking: any) => {
        const user = booking.user as any;
        if (!user) return null;
        return {
          _id: String(user._id),
          name: String(user.name || ''),
          email: String(user.email || ''),
          bookingId: String(booking._id),
          startDate: booking.startDate,
        };
      })
      .filter(Boolean);

    const emptyBeds = Math.max(0, Number(room.capacity || 0) - Number(room.currentOccupancy || 0));

    res.json({
      room: {
        _id: String(room._id),
        roomNumber: room.roomNumber,
        type: room.type,
        monthlyRent: room.monthlyRent,
        capacity: room.capacity,
        currentOccupancy: room.currentOccupancy,
        emptyBeds,
      },
      students,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
