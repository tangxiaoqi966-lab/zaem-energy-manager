import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as authController from './auth.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.post('/login', authController.login);
router.post('/force-change-password', authController.forceChangePassword);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.get('/users', authenticate, requireRole(UserRole.admin), authController.listUsers);
router.post('/users', authenticate, requireRole(UserRole.admin), authController.createUser);
router.put('/users/:userId', authenticate, requireRole(UserRole.admin), authController.updateUser);
router.delete('/users/:userId', authenticate, requireRole(UserRole.admin), authController.deleteUser);

export default router;
