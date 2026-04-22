import { Router } from 'express';
import * as publicStatusController from './public-status.controller';

const router = Router();

router.get('/', publicStatusController.getPublicStatus);
router.get('/stream', publicStatusController.streamPublicStatus);

export default router;
