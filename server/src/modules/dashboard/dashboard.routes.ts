import { Router } from 'express';
import * as dashboardController from './dashboard.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/', authenticate, dashboardController.getDashboardSummary);

export default router;
