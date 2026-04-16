import express from 'express';
import { getStudents, getStudentById, deleteStudent, exportStudentsCsv } from '../controllers/studentController';
import { protect, staffOnly, adminOnly } from '../middleware/authMiddleware';
import { validateRequest } from '../middleware/validateRequest';
import { listQuerySchema } from '../validators/commonValidators';

const router = express.Router();

router.route('/')
  .get(protect, staffOnly, validateRequest({ query: listQuerySchema }), getStudents);

router.get('/export', protect, staffOnly, exportStudentsCsv);

router.route('/:id')
  .get(protect, staffOnly, getStudentById)
  .delete(protect, adminOnly, deleteStudent);

export default router;
