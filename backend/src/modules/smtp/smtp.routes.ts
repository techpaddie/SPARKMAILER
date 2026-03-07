import { Router } from 'express';
import * as smtpController from './smtp.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/test-stream', smtpController.testStream);
router.get('/', smtpController.list);
router.get('/:id', smtpController.getOne);
router.post('/', smtpController.create);
router.post('/:id/reactivate', smtpController.reactivate);
router.patch('/:id', smtpController.update);
router.delete('/:id', smtpController.remove);

export default router;
