import { Router } from 'express';
import * as templatesController from './templates.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { licenseValidationMiddleware } from '../../middleware/license.middleware';

const router = Router();

router.use(authMiddleware, licenseValidationMiddleware);

router.get('/', templatesController.list);
router.get('/:id', templatesController.getOne);
router.post('/', templatesController.create);
router.patch('/:id', templatesController.update);
router.delete('/:id', templatesController.remove);

export default router;
