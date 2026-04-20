import { Router } from 'express';
import * as deliverabilityController from './deliverability.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);
router.get('/summary', deliverabilityController.getSummary);
router.get('/check', deliverabilityController.getDomainCheck);

export default router;
