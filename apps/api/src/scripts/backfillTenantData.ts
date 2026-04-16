import 'dotenv/config';
import mongoose from 'mongoose';
import { Hostel, SubscriptionPlan } from '../models/Hostel';
import { User } from '../models/User';
import { Room } from '../models/Room';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { Payment } from '../models/Payment';

type Stats = {
  usersUpdated: number;
  roomsUpdated: number;
  bookingsUpdated: number;
  complaintsUpdated: number;
  paymentsUpdated: number;
};

const isDryRun = process.argv.includes('--dry-run');
const legacyHostelName = process.env.LEGACY_HOSTEL_NAME || 'Legacy Hostel';

const missingTenantFilter = {
  $or: [{ hostelId: { $exists: false } }, { hostelId: null }],
};

const connect = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is required to run tenant backfill');
  }

  await mongoose.connect(mongoUri);
};

const getOrCreateLegacyHostelId = async () => {
  const existing = await Hostel.findOne({ name: legacyHostelName });

  if (existing) {
    return existing._id;
  }

  if (isDryRun) {
    return new mongoose.Types.ObjectId();
  }

  const created = await Hostel.create({
    name: legacyHostelName,
    subscriptionPlan: SubscriptionPlan.BASIC,
    isActive: true,
  });

  return created._id;
};

const updateManyOrCount = async (model: any, filter: any, update: any) => {
  if (isDryRun) {
    return model.countDocuments(filter);
  }

  const result = await model.updateMany(filter, update);
  return result.modifiedCount || 0;
};

const backfillBookings = async (
  defaultHostelId: mongoose.Types.ObjectId,
  userHostelById: Map<string, string>,
  roomHostelById: Map<string, string>
) => {
  const missing = await Booking.find(missingTenantFilter).select('_id user room');

  if (missing.length === 0) {
    return 0;
  }

  const ops = missing.map((doc: any) => {
    const userHostelId = doc.user ? userHostelById.get(String(doc.user)) : undefined;
    const roomHostelId = doc.room ? roomHostelById.get(String(doc.room)) : undefined;
    const hostelId = userHostelId || roomHostelId || String(defaultHostelId);

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { hostelId } },
      },
    };
  });

  if (isDryRun) {
    return ops.length;
  }

  const result = await Booking.bulkWrite(ops, { ordered: false });
  return result.modifiedCount || 0;
};

const backfillComplaints = async (
  defaultHostelId: mongoose.Types.ObjectId,
  userHostelById: Map<string, string>
) => {
  const missing = await Complaint.find(missingTenantFilter).select('_id user');

  if (missing.length === 0) {
    return 0;
  }

  const ops = missing.map((doc: any) => {
    const userHostelId = doc.user ? userHostelById.get(String(doc.user)) : undefined;
    const hostelId = userHostelId || String(defaultHostelId);

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { hostelId } },
      },
    };
  });

  if (isDryRun) {
    return ops.length;
  }

  const result = await Complaint.bulkWrite(ops, { ordered: false });
  return result.modifiedCount || 0;
};

const backfillPayments = async (
  defaultHostelId: mongoose.Types.ObjectId,
  userHostelById: Map<string, string>,
  bookingHostelById: Map<string, string>
) => {
  const missing = await Payment.find(missingTenantFilter).select('_id user booking');

  if (missing.length === 0) {
    return 0;
  }

  const ops = missing.map((doc: any) => {
    const userHostelId = doc.user ? userHostelById.get(String(doc.user)) : undefined;
    const bookingHostelId = doc.booking ? bookingHostelById.get(String(doc.booking)) : undefined;
    const hostelId = userHostelId || bookingHostelId || String(defaultHostelId);

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { hostelId } },
      },
    };
  });

  if (isDryRun) {
    return ops.length;
  }

  const result = await Payment.bulkWrite(ops, { ordered: false });
  return result.modifiedCount || 0;
};

const run = async () => {
  const stats: Stats = {
    usersUpdated: 0,
    roomsUpdated: 0,
    bookingsUpdated: 0,
    complaintsUpdated: 0,
    paymentsUpdated: 0,
  };

  await connect();

  const defaultHostelId = await getOrCreateLegacyHostelId();

  stats.usersUpdated = await updateManyOrCount(User, missingTenantFilter, {
    $set: { hostelId: defaultHostelId },
  });

  stats.roomsUpdated = await updateManyOrCount(Room, missingTenantFilter, {
    $set: { hostelId: defaultHostelId },
  });

  const [users, rooms] = await Promise.all([
    User.find().select('_id hostelId').lean(),
    Room.find().select('_id hostelId').lean(),
  ]);

  const userHostelById = new Map<string, string>();
  users.forEach((doc: any) => userHostelById.set(String(doc._id), String(doc.hostelId)));

  const roomHostelById = new Map<string, string>();
  rooms.forEach((doc: any) => roomHostelById.set(String(doc._id), String(doc.hostelId)));

  stats.bookingsUpdated = await backfillBookings(defaultHostelId, userHostelById, roomHostelById);
  stats.complaintsUpdated = await backfillComplaints(defaultHostelId, userHostelById);

  const bookings = await Booking.find().select('_id hostelId').lean();
  const bookingHostelById = new Map<string, string>();
  bookings.forEach((doc: any) => bookingHostelById.set(String(doc._id), String(doc.hostelId)));

  stats.paymentsUpdated = await backfillPayments(defaultHostelId, userHostelById, bookingHostelById);

  console.log('Tenant backfill completed.');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Default hostel: ${legacyHostelName} (${defaultHostelId})`);
  console.table(stats);
};

run()
  .catch((error) => {
    console.error('Tenant backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
