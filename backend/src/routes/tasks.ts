import { Router } from 'express';
import {
  getTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  toggleTask,
} from '../controllers/taskController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All task routes require authentication
router.use(authenticate);

router.get('/', getTasks);
router.post('/', createTask);

router.get('/:id', getTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);
router.patch('/:id/toggle', toggleTask);

export default router;
