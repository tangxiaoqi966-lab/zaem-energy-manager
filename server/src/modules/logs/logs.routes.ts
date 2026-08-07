import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import {
  getOperationLogs,
  getAlarmLogs,
  resolveAlarm,
} from './logs.controller';

const router = Router();

router.get('/operations', authenticate, getOperationLogs);
router.get('/alarms', authenticate, getAlarmLogs);
router.post('/alarms/:id/resolve', authenticate, requireRole(UserRole.admin, UserRole.boss), resolveAlarm);

export default router;
