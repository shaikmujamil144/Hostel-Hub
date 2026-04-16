import { Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const skip = (page - 1) * limit;
    const tenantId = req.tenantId || 'default-tenant';

    const [logs, total] = await Promise.all([
      AuditLog.find({ tenantId })
        .populate('actorId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments({ tenantId }),
    ]);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
