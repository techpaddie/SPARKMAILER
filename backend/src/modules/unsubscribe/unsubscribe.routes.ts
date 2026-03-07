import { Router } from 'express';
import { unsubscribeGet, unsubscribeOneClickPost } from './unsubscribe.controller';

const router = Router();

router.get('/', unsubscribeGet);
router.post('/', unsubscribeOneClickPost);

export default router;

