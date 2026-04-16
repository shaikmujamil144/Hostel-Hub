import { Request, Response } from 'express';
import { Complaint } from '../models/Complaint';
import { io } from '../index'; // Import the Socket.io instance
import { AuthRequest } from '../middleware/authMiddleware';
import { createTenantNotification } from '../services/notificationService';
import { NotificationType } from '../models/Notification';
import { Role, User } from '../models/User';
import { paginationMeta, parsePagination } from '../utils/pagination';
import { detectComplaintPriority } from '../utils/complaintPriority';
import { Hostel } from '../models/Hostel';
import { getSlaDueAt } from '../services/slaPolicyService';
import { escalateOverdueComplaintsForTenant } from '../services/complaintEscalationService';

const ALLOWED_STATUSES = ['Open', 'InProgress', 'Resolved'];
const ALLOWED_PRIORITIES = ['Low', 'Medium', 'High'];

// @desc    Create new complaint
// @route   POST /api/complaints
// @access  Private
export const createComplaint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { title, description } = req.body;
    const priority = detectComplaintPriority(title, description);
    const hostel = await Hostel.findById(tenantId).select('subscriptionPlan');

    const complaint = await Complaint.create({
      hostelId: tenantId,
      user: req.user?._id,
      title,
      description,
      priorityLabel: priority.label,
      priorityScore: priority.score,
      priorityFactors: priority.factors,
      slaDueAt: getSlaDueAt(hostel?.subscriptionPlan, priority.label),
      history: [
        {
          action: 'Created',
          changedBy: req.user?._id,
          changedAt: new Date(),
          toStatus: 'Open',
          note: 'Complaint created',
        },
      ],
    });

    const populatedComplaint = await complaint
      .populate('user', 'name email')
      .populate('assignedTo', 'name email role')
      .populate('history.changedBy', 'name email role')
      .populate('history.assignedTo', 'name email role');

    await createTenantNotification({
      tenantId,
      type: NotificationType.COMPLAINT_CREATED,
      title: 'New complaint submitted',
      message: `${req.user?.name || 'A student'} raised a complaint: ${title}`,
      entityType: 'Complaint',
      entityId: String(complaint._id),
      metadata: {
        status: complaint.status,
      },
    });

    // Emit real-time event
    io.to(`tenant:${tenantId}`).emit('new_complaint', populatedComplaint);

    res.status(201).json(populatedComplaint);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update complaint status
// @route   PUT /api/complaints/:id
// @access  Private/Staff
export const updateComplaintStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { status } = req.body;
    if (!ALLOWED_STATUSES.includes(status)) {
      res.status(400).json({ message: 'Invalid complaint status' });
      return;
    }

    const complaint = await Complaint.findOne({ _id: req.params.id, hostelId: tenantId });

    if (complaint) {
      const previousStatus = complaint.status;
      complaint.status = status;

      if (status === 'InProgress' && !complaint.firstResponseAt) {
        complaint.firstResponseAt = new Date();
      }
      if (status === 'Resolved') {
        complaint.resolvedAt = new Date();
      } else {
        complaint.resolvedAt = undefined;
      }

      complaint.history.push({
        action: 'StatusChanged',
        changedBy: req.user?._id,
        changedAt: new Date(),
        fromStatus: previousStatus,
        toStatus: status,
        note: `Status changed from ${previousStatus} to ${status}`,
      });

      const updatedComplaint = await complaint.save();
      const populatedComplaint = await updatedComplaint
        .populate('user', 'name email')
        .populate('assignedTo', 'name email role')
        .populate('history.changedBy', 'name email role')
        .populate('history.assignedTo', 'name email role');

      await createTenantNotification({
        tenantId,
        type: NotificationType.COMPLAINT_STATUS_UPDATED,
        title: 'Complaint status updated',
        message: `Complaint status changed to ${updatedComplaint.status}: ${updatedComplaint.title}`,
        entityType: 'Complaint',
        entityId: String(updatedComplaint._id),
        metadata: {
          status: updatedComplaint.status,
        },
      });
      
      io.to(`tenant:${tenantId}`).emit('complaint_status_updated', populatedComplaint);
      
      res.json(populatedComplaint);
    } else {
      res.status(404).json({ message: 'Complaint not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Assign complaint to staff/admin
// @route   PUT /api/complaints/:id/assign
// @access  Private/Staff
export const assignComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { assignedTo } = req.body;
    if (!assignedTo) {
      res.status(400).json({ message: 'assignedTo is required' });
      return;
    }

    const assignee = await User.findOne({
      _id: assignedTo,
      hostelId: tenantId,
      role: { $in: [Role.ADMIN, Role.STAFF] },
    });

    if (!assignee) {
      res.status(404).json({ message: 'Assignee not found in this hostel' });
      return;
    }

    const complaint = await Complaint.findOne({ _id: req.params.id, hostelId: tenantId });
    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    complaint.assignedTo = assignee._id;
    complaint.assignedAt = new Date();
    if (!complaint.firstResponseAt) {
      complaint.firstResponseAt = new Date();
    }

    complaint.history.push({
      action: 'Assigned',
      changedBy: req.user?._id,
      changedAt: new Date(),
      assignedTo: assignee._id,
      note: `Assigned to ${assignee.name}`,
      fromStatus: complaint.status,
      toStatus: complaint.status,
    });

    const updatedComplaint = await complaint.save();
    const populatedComplaint = await updatedComplaint
      .populate('user', 'name email')
      .populate('assignedTo', 'name email role')
      .populate('history.changedBy', 'name email role')
      .populate('history.assignedTo', 'name email role');

    await createTenantNotification({
      tenantId,
      recipientUserId: String(assignee._id),
      type: NotificationType.COMPLAINT_STATUS_UPDATED,
      title: 'Complaint assigned',
      message: `You have been assigned complaint: ${updatedComplaint.title}`,
      entityType: 'Complaint',
      entityId: String(updatedComplaint._id),
      metadata: {
        status: updatedComplaint.status,
        assignedTo: String(assignee._id),
      },
    });

    io.to(`tenant:${tenantId}`).emit('complaint_assigned', populatedComplaint);
    res.json(populatedComplaint);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all complaints
// @route   GET /api/complaints
// @access  Private
export const getComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const status = String(req.query.status || '').trim();
    const assignedTo = String(req.query.assignedTo || '').trim();
    const search = String(req.query.search || '').trim();
    const priority = String(req.query.priority || '').trim();
    const sortBy = String(req.query.sortBy || '').trim();
    const overdueOnly = String(req.query.overdueOnly || '').toLowerCase() === 'true';

    const filter: any = { hostelId: tenantId };

    if (status && ALLOWED_STATUSES.includes(status)) {
      filter.status = status;
    }
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }
    if (priority && ALLOWED_PRIORITIES.includes(priority)) {
      filter.priorityLabel = priority;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (overdueOnly) {
      filter.status = { $in: ['Open', 'InProgress'] };
      filter.slaDueAt = { $lt: new Date() };
    }

    if (req.user?.role === Role.STUDENT) {
      filter.user = req.user?._id;
    }

    const sort: any = { createdAt: -1 };
    if (sortBy === 'priority') {
      sort.priorityScore = -1;
    }

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('user', 'name email')
        .populate('assignedTo', 'name email role')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Complaint.countDocuments(filter),
    ]);

    res.json({
      data: complaints,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get complaint details with status timeline
// @route   GET /api/complaints/:id
// @access  Private
export const getComplaintById = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const filter: any = { _id: req.params.id, hostelId: tenantId };
    if (req.user?.role === Role.STUDENT) {
      filter.user = req.user?._id;
    }

    const complaint = await Complaint.findOne(filter)
      .populate('user', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('history.changedBy', 'name email role')
      .populate('history.assignedTo', 'name email role');

    if (!complaint) {
      res.status(404).json({ message: 'Complaint not found' });
      return;
    }

    res.json(complaint);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auto-escalate overdue complaints
// @route   POST /api/complaints/escalate-overdue
// @access  Private/Staff
export const autoEscalateOverdueComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const result = await escalateOverdueComplaintsForTenant({
      tenantId,
      actorUserId: req.user?._id ? String(req.user._id) : undefined,
      onEscalated: (complaint) => {
        io.to(`tenant:${tenantId}`).emit('complaint_escalated', complaint);
      },
    });

    if (result.escalated === 0) {
      res.json({ escalated: 0, message: 'No overdue complaints pending escalation' });
      return;
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get assignable staff/admin users in current tenant
// @route   GET /api/complaints/assignees
// @access  Private/Staff
export const getComplaintAssignees = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const users = await User.find({
      hostelId: tenantId,
      role: { $in: [Role.ADMIN, Role.STAFF] },
    })
      .select('name email role')
      .sort({ role: 1, name: 1 });

    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
