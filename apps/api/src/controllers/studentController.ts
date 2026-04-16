import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import { logAuditEvent } from '../services/auditService';
import { paginationMeta, parsePagination } from '../utils/pagination';

// @desc    Get all students
// @route   GET /api/students
// @access  Private/Staff
export const getStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const { page, limit, skip } = parsePagination(req.query as any);
    const search = String(req.query.search || '').trim();

    const filter: any = { role: Role.STUDENT, hostelId: tenantId };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [students, total] = await Promise.all([
      User.find(filter)
        .select('name email phone role createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      data: students,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get student by ID
// @route   GET /api/students/:id
// @access  Private/Staff
export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const student: any = await User.findOne({ _id: req.params.id, hostelId: tenantId })
      .select('name email phone role createdAt updatedAt')
      .lean();
    if (student && student.role === Role.STUDENT) {
      res.json(student);
    } else {
      res.status(404).json({ message: 'Student not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private/Admin
export const deleteStudent = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const student = await User.findOne({ _id: req.params.id, hostelId: tenantId });
    if (student && student.role === Role.STUDENT) {
      await User.deleteOne({ _id: student._id });
      await logAuditEvent({
        actorId: req.user?._id?.toString(),
        action: 'DELETE_STUDENT',
        entityType: 'User',
        entityId: String(student._id),
        tenantId: req.tenantId,
      });
      res.json({ message: 'Student removed' });
    } else {
      res.status(404).json({ message: 'Student not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export students as CSV
// @route   GET /api/students/export
// @access  Private/Staff
export const exportStudentsCsv = async (_req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = _req.tenantId;
    if (!tenantId) {
      res.status(401).json({ message: 'Tenant context missing' });
      return;
    }

    const students = await User.find({ role: Role.STUDENT, hostelId: tenantId })
      .select('name email phone createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const header = 'name,email,phone,createdAt';
    const rows = students.map((student: any) => {
      const name = String(student.name || '').replace(/,/g, ' ');
      const email = String(student.email || '').replace(/,/g, ' ');
      const phone = String(student.phone || '').replace(/,/g, ' ');
      const createdAt = student.createdAt ? new Date(student.createdAt).toISOString() : '';
      return `${name},${email},${phone},${createdAt}`;
    });

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
