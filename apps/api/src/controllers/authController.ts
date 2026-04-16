import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import { Hostel, SubscriptionPlan } from '../models/Hostel';
import { PasswordResetOtp } from '../models/PasswordResetOtp';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const generateToken = (id: string, hostelId: string) => {
  return jwt.sign({ id, hostelId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeContact = (value: string) => value.trim();

const isEmailContact = (value: string) => emailRegex.test(value.trim());

const buildIdentifierQuery = (identifier: string) => {
  const value = normalizeContact(identifier);
  if (isEmailContact(value)) {
    return { email: value.toLowerCase() };
  }
  return {
    $or: [{ registrationId: value }, { phone: value }, { email: value.toLowerCase() }],
  };
};

const findUserForReset = async ({
  loginAs,
  contact,
  hostelId,
}: {
  loginAs: 'Admin' | 'Student';
  contact: string;
  hostelId?: string;
}) => {
  const query: any = buildIdentifierQuery(contact);
  if (loginAs === 'Admin') {
    query.role = Role.ADMIN;
    return User.findOne(query);
  }

  if (!hostelId || !mongoose.Types.ObjectId.isValid(hostelId)) {
    return null;
  }

  query.hostelId = hostelId;
  query.role = Role.STUDENT;
  return User.findOne(query);
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, registrationId, role, phone, hostelId, hostelName, subscriptionPlan } = req.body;

    let tenantHostel: any = null;

    if (hostelId) {
      if (!mongoose.Types.ObjectId.isValid(hostelId)) {
        res.status(400).json({ message: 'Invalid hostelId' });
        return;
      }

      tenantHostel = await Hostel.findById(hostelId);
      if (!tenantHostel || !tenantHostel.isActive) {
        res.status(404).json({ message: 'Hostel not found or inactive' });
        return;
      }
    } else if (hostelName) {
      tenantHostel = await Hostel.create({
        name: hostelName,
        subscriptionPlan: subscriptionPlan || SubscriptionPlan.BASIC,
      });
    } else {
      res.status(400).json({ message: 'hostelId or hostelName is required' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRegistrationId = registrationId ? String(registrationId).trim() : undefined;

    const userExists = await User.findOne({ email: normalizedEmail, hostelId: tenantHostel._id });
    if (userExists) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    if (normalizedRegistrationId) {
      const registrationIdExists = await User.findOne({
        hostelId: tenantHostel._id,
        registrationId: normalizedRegistrationId,
      });
      if (registrationIdExists) {
        res.status(400).json({ message: 'Registration ID already exists in this hostel' });
        return;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      hostelId: tenantHostel._id,
      registrationId: normalizedRegistrationId,
      name,
      email: normalizedEmail,
      passwordHash,
      role: role || Role.STUDENT,
      phone,
    });

    if (user) {
      if (!tenantHostel.ownerId && user.role === Role.ADMIN) {
        tenantHostel.ownerId = user._id;
        await tenantHostel.save();
      }

      res.status(201).json({
        _id: user._id,
        hostelId: user.hostelId,
        registrationId: user.registrationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token: generateToken(String(user._id), String(user.hostelId)),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const registerStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { hostelId, registrationId, name, phone, email, password } = req.body;

    if (!mongoose.Types.ObjectId.isValid(hostelId)) {
      res.status(400).json({ message: 'Invalid hostelId' });
      return;
    }

    const hostel = await Hostel.findById(hostelId);
    if (!hostel || !hostel.isActive) {
      res.status(404).json({ message: 'Hostel not found or inactive' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRegistrationId = String(registrationId).trim();
    const normalizedPhone = String(phone).trim();

    const existing = await User.findOne({
      hostelId,
      $or: [{ email: normalizedEmail }, { registrationId: normalizedRegistrationId }, { phone: normalizedPhone }],
    });

    if (existing) {
      res.status(400).json({ message: 'Student with email, phone, or registration ID already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));

    const student = await User.create({
      hostelId,
      registrationId: normalizedRegistrationId,
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      role: Role.STUDENT,
      passwordHash,
    });

    res.status(201).json({
      message: 'Student registered successfully',
      student: {
        _id: student._id,
        hostelId: student.hostelId,
        registrationId: student.registrationId,
        name: student.name,
        email: student.email,
        phone: student.phone,
        role: student.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, hostelId, loginAs } = req.body;
    const identifier = String(req.body.identifier || req.body.adminId || req.body.email || '').trim();

    if (!identifier) {
      res.status(400).json({ message: 'identifier is required' });
      return;
    }

    const userQuery: any = buildIdentifierQuery(identifier);

    if (loginAs === 'Admin') {
      userQuery.role = Role.ADMIN;
    } else if (loginAs === 'Student') {
      if (!hostelId || !mongoose.Types.ObjectId.isValid(hostelId)) {
        res.status(400).json({ message: 'Valid hostelId is required for student login' });
        return;
      }
      userQuery.hostelId = hostelId;
      userQuery.role = Role.STUDENT;
    } else {
      if (!hostelId || !mongoose.Types.ObjectId.isValid(hostelId)) {
        res.status(400).json({ message: 'Valid hostelId is required' });
        return;
      }
      userQuery.hostelId = hostelId;
    }

    const user = await User.findOne(userQuery);

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      res.json({
        _id: user._id,
        hostelId: user.hostelId,
        registrationId: user.registrationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token: generateToken(String(user._id), String(user.hostelId)),
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const requestPasswordResetOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginAs, contact, hostelId } = req.body as {
      loginAs: 'Admin' | 'Student';
      contact: string;
      hostelId?: string;
    };

    const normalizedContact = normalizeContact(contact);
    const user = await findUserForReset({ loginAs, contact: normalizedContact, hostelId });

    if (!user) {
      res.status(404).json({ message: 'User not found for the provided details' });
      return;
    }

    await PasswordResetOtp.updateMany(
      { userId: user._id, contact: normalizedContact, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } }
    );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PasswordResetOtp.create({
      userId: user._id,
      hostelId: user.hostelId,
      channel: isEmailContact(normalizedContact) ? 'email' : 'phone',
      contact: normalizedContact,
      otpHash,
      expiresAt,
    });

    console.log(`Password reset OTP for ${normalizedContact}: ${otp}`);

    res.json({
      message: 'OTP sent successfully',
      expiresInSeconds: 600,
      ...(process.env.NODE_ENV !== 'production' ? { otp } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPasswordWithOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginAs, contact, hostelId, otp, newPassword } = req.body as {
      loginAs: 'Admin' | 'Student';
      contact: string;
      hostelId?: string;
      otp: string;
      newPassword: string;
    };

    const normalizedContact = normalizeContact(contact);
    const user = await findUserForReset({ loginAs, contact: normalizedContact, hostelId });

    if (!user) {
      res.status(404).json({ message: 'User not found for the provided details' });
      return;
    }

    const otpRecord = await PasswordResetOtp.findOne({
      userId: user._id,
      contact: normalizedContact,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      res.status(400).json({ message: 'OTP expired or not found. Please request a new OTP.' });
      return;
    }

    const isOtpValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isOtpValid) {
      res.status(400).json({ message: 'Invalid OTP' });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await user.save();

    otpRecord.consumedAt = new Date();
    await otpRecord.save();

    res.json({ message: 'Password reset successful. Please log in with your new password.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getHostels = async (_req: Request, res: Response): Promise<void> => {
  try {
    const hostels = await Hostel.find({ isActive: true })
      .select('name subscriptionPlan')
      .sort({ name: 1 });

    res.json(hostels);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
