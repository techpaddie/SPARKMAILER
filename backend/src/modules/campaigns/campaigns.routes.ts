import { Router } from 'express';
import * as campaignsController from './campaigns.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { licenseValidationMiddleware, quotaCheckMiddleware } from '../../middleware/license.middleware';

const router = Router();

router.use(authMiddleware, licenseValidationMiddleware);

router.get('/', campaignsController.list);
router.get('/:id', campaignsController.getOne);
router.post('/', campaignsController.create);
router.post(
  '/:id/start',
  quotaCheckMiddleware('campaign'),
  quotaCheckMiddleware('email'),
  campaignsController.startCampaign
);
router.post('/:id/pause', campaignsController.pauseCampaign);
router.post('/:id/resume', quotaCheckMiddleware('email'), campaignsController.resumeCampaign);
router.patch('/:id', campaignsController.updateCampaign);
router.delete('/:id', campaignsController.deleteCampaign);

export default router;
