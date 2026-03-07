import { Router } from 'express';
import multer from 'multer';
import * as listsController from './lists.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Lists (leads) are available to any authenticated user, even if the license is expired,
// so we only require authentication here (no licenseValidationMiddleware).
router.use(authMiddleware);

router.get('/', listsController.list);
router.get('/:id', listsController.getOne);
router.post('/', listsController.create);
router.patch('/:id', listsController.update);
router.delete('/:id', listsController.remove);
router.post('/:id/import', listsController.importEmails);
router.post('/:id/import/file', upload.single('file'), listsController.importFromFile);
router.delete('/:id/contacts/:contactId', listsController.removeContact);

export default router;
