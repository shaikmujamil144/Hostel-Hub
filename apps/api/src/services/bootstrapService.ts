import bcrypt from 'bcryptjs';
import { Hostel, SubscriptionPlan } from '../models/Hostel';
import { Role, User } from '../models/User';

const isTruthy = (value: string | undefined) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const ensureDevelopmentBootstrapData = async (): Promise<void> => {
  const shouldBootstrap =
    process.env.NODE_ENV !== 'production' || isTruthy(process.env.ENABLE_DEFAULT_ADMIN_SEED);

  if (!shouldBootstrap) {
    return;
  }

  try {
    const defaultHostelName = process.env.DEFAULT_HOSTEL_NAME || 'HostelHub Main Hostel';
    const defaultAdminId = process.env.DEFAULT_ADMIN_ID || '123';
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@hostelhub.local';
    const defaultAdminName = process.env.DEFAULT_ADMIN_NAME || 'HostelHub Admin';

    let hostel = await Hostel.findOne({ name: defaultHostelName, isActive: true });
    if (!hostel) {
      hostel = await Hostel.create({
        name: defaultHostelName,
        subscriptionPlan: SubscriptionPlan.BASIC,
      });
    }

    let adminUser = await User.findOne({
      hostelId: hostel._id,
      $or: [{ registrationId: defaultAdminId }, { email: defaultAdminEmail }],
    });

    const passwordHash = await bcrypt.hash(defaultAdminPassword, await bcrypt.genSalt(10));

    if (!adminUser) {
      adminUser = await User.create({
        hostelId: hostel._id,
        registrationId: defaultAdminId,
        name: defaultAdminName,
        email: defaultAdminEmail,
        phone: '9999999999',
        role: Role.ADMIN,
        passwordHash,
      });
    } else {
      adminUser.registrationId = defaultAdminId;
      adminUser.name = defaultAdminName;
      adminUser.email = defaultAdminEmail;
      adminUser.role = Role.ADMIN;
      adminUser.passwordHash = passwordHash;
      await adminUser.save();
    }

    if (!hostel.ownerId || String(hostel.ownerId) !== String(adminUser._id)) {
      hostel.ownerId = adminUser._id;
      await hostel.save();
    }

    console.log(
      `Default admin ready. Admin ID: ${defaultAdminId}, Password: ${defaultAdminPassword}, Hostel: ${hostel.name}`
    );
  } catch (error: any) {
    console.error('Default bootstrap seed failed:', error?.message || error);
  }
};
