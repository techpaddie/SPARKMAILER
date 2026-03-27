import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts from this network. Please wait about 15 minutes and try again.',
  },
});

router.post('/activate', authController.activate);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refresh);

router.get('/me', authMiddleware, authController.me);
router.patch('/me', authMiddleware, authController.updateMe);

export default router;
