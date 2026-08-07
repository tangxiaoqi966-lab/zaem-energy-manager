import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import {
  getSettings,
  updateSettings,
  xiaomiStatus,
  xiaomiLogin,
  xiaomiSync,
  controlDevice,
  renameDevice,
  bulkControlDevices,
} from './system.controller';

const router = Router();

router.get('/settings', authenticate, getSettings);
router.put('/settings', authenticate, requireRole(UserRole.admin, UserRole.boss), updateSettings);
router.get('/xiaomi/status', authenticate, xiaomiStatus);
router.post('/xiaomi/login', authenticate, requireRole(UserRole.admin), xiaomiLogin);
router.post('/xiaomi/login/continue', authenticate, requireRole(UserRole.admin), xiaomiLogin);
router.post('/xiaomi/sync', authenticate, requireRole(UserRole.admin), xiaomiSync);
router.post('/devices/control-all', authenticate, requireRole(UserRole.admin, UserRole.boss), bulkControlDevices);
router.post('/device/:did/control', authenticate, requireRole(UserRole.admin, UserRole.boss), controlDevice);
router.put('/device/:did/name', authenticate, requireRole(UserRole.admin, UserRole.boss), renameDevice);

export default router;
