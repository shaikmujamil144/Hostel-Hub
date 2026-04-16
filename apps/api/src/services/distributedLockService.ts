import os from 'os';
import { SchedulerLock } from '../models/SchedulerLock';

const LOCK_OWNER_ID = `${os.hostname()}-${process.pid}`;

type AcquireLockInput = {
  key: string;
  ttlMs: number;
};

export const acquireDistributedLock = async (input: AcquireLockInput): Promise<boolean> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(input.ttlMs, 1000));

  try {
    const lock = await SchedulerLock.findOneAndUpdate(
      {
        key: input.key,
        $or: [{ expiresAt: { $lte: now } }, { ownerId: LOCK_OWNER_ID }],
      },
      {
        $set: {
          ownerId: LOCK_OWNER_ID,
          expiresAt,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return !!lock && lock.ownerId === LOCK_OWNER_ID;
  } catch (error: any) {
    if (error?.code === 11000) {
      return false;
    }

    throw error;
  }
};

export const releaseDistributedLock = async (key: string): Promise<void> => {
  await SchedulerLock.deleteOne({ key, ownerId: LOCK_OWNER_ID });
};
