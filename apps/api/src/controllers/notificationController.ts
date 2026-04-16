import { Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { Role } from '../models/User';
import { paginationMeta, parsePagination } from '../utils/pagination';

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const filter: any = { hostelId: tenantId };

    if (unreadOnly) {
      filter.isRead = false;
    }

    // Students can only see notifications addressed to them.
    if (req.user?.role === Role.STUDENT) {
      filter.recipient = req.user?._id;
    }

    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      data: items,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      hostelId: tenantId,
    });

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    if (req.user?.role === Role.STUDENT && String(notification.recipient) !== String(req.user?._id)) {
      res.status(403).json({ message: 'Not authorized to modify this notification' });
      return;
    }

    notification.isRead = true;
    const updated = await notification.save();
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const filter: any = { hostelId: tenantId, isRead: false };

    if (req.user?.role === Role.STUDENT) {
      filter.recipient = req.user?._id;
    }

    const result = await Notification.updateMany(filter, { $set: { isRead: true } });

    res.json({
      message: 'Notifications marked as read',
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
