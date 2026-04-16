import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { Role, User } from '../models/User';
import { Hostel } from '../models/Hostel';

export interface AuthRequest extends Request {
  user?: any;
}

type JwtPayload = {
  id: string;
  hostelId: string;
};

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;

      req.user = await User.findOne({ _id: decoded.id, hostelId: decoded.hostelId }).select('-passwordHash');
      if (!req.user) throw new Error('User not found');

      const requestedTenantId = (req.headers['x-tenant-id'] as string | undefined)?.trim();
      req.tenantId = String(req.user.hostelId);

      if (req.user.role === Role.ADMIN && requestedTenantId && requestedTenantId !== String(req.user.hostelId)) {
        const ownedHostel = await Hostel.findOne({
          _id: requestedTenantId,
          ownerId: req.user._id,
          isDeleted: { $ne: true },
          isActive: true,
        })
          .select('_id')
          .lean();

        if (ownedHostel) {
          req.tenantId = requestedTenantId;
        }
      }

      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === Role.ADMIN) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as admin' });
  }
};

export const staffOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === Role.ADMIN || req.user.role === Role.STAFF)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as staff/admin' });
  }
};
