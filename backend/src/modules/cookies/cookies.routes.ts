import { Router } from 'express';
import * as cookiesController from './cookies.controller';

const router = Router();

router.post('/consent', cookiesController.captureConsent);

export default router;
