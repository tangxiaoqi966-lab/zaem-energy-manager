import { Router } from 'express';
import * as energyController from './energy.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/', authenticate, energyController.getRooms);
router.get('/limits', authenticate, energyController.getLimits);
router.get('/stats/ranking', authenticate, energyController.ranking);
router.post('/limits/bulk-toggle', authenticate, requireRole(UserRole.admin, UserRole.boss), energyController.bulkToggleLimits);
router.post('/limits/bulk-update', authenticate, requireRole(UserRole.admin, UserRole.boss), energyController.bulkUpdateLimits);
router.get('/:roomId', authenticate, energyController.getRoomDetail);
router.put('/limits/:roomId', authenticate, requireRole(UserRole.admin, UserRole.boss), energyController.updateLimit);
router.post('/:roomId/cutoff', authenticate, requireRole(UserRole.admin, UserRole.boss), energyController.cutoff);
router.post('/:roomId/restore', authenticate, requireRole(UserRole.admin, UserRole.boss), energyController.restore);

export default router;
