import { Router } from 'express';
import * as authController from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.post('/activate', authController.activate);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

router.get('/me', authMiddleware, authController.me);
router.patch('/me', authMiddleware, authController.updateMe);

export default router;
