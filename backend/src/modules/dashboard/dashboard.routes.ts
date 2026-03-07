import { Router } from 'express';
import * as dashboardController from './dashboard.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

// Dashboard stats should be visible for any authenticated user,
// even if the license is expired or restricted, so we only require auth.
router.use(authMiddleware);

router.get('/stats', dashboardController.getStats);
router.get('/mailgun-stats', dashboardController.getMailgunStatsRoute);
router.get('/tracking', dashboardController.getTracking);

export default router;
