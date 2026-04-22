import { Router } from 'express';
import * as adminController from './admin.controller';
import * as adminSupportController from './admin-support.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnlyMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware, adminOnlyMiddleware);

router.post('/users', adminController.createUser);
router.post('/licenses', adminController.createLicense);
router.get('/licenses', adminController.listLicenses);
router.patch('/licenses/:id', adminController.updateLicense);
router.delete('/licenses/:id', adminController.deleteLicense);
router.post('/licenses/:id/revoke', adminController.revokeLicense);

router.get('/users', adminController.listUsers);
router.get('/usage', adminController.getUsageStats);
router.get('/campaigns', adminController.listCampaigns);
router.get('/smtp-health', adminController.getSmtpHealth);
router.get('/cookie-consents', adminController.listCookieConsents);
router.get('/cookie-consents/export.csv', adminController.exportCookieConsentsCsv);
router.get('/support/tickets', adminSupportController.listSupportTickets);
router.get('/support/tickets/:id', adminSupportController.getSupportTicket);
router.post('/support/tickets/:id/reply', adminSupportController.replyToSupportTicket);
router.patch('/support/tickets/:id', adminSupportController.updateSupportTicket);
router.delete('/support/tickets/:id', adminSupportController.deleteSupportTicket);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/activate', adminController.activateUser);
router.post('/users/:id/impersonate', adminController.impersonateUser);
router.post('/users/:id/reset-password', adminController.resetUserPassword);

router.get('/settings/smtp', adminController.getSystemSmtp);
router.put('/settings/smtp', adminController.updateSystemSmtp);
router.get('/settings/maintenance', adminController.getMaintenanceState);
router.put('/settings/maintenance', adminController.updateMaintenanceState);

router.post('/notify-user', adminController.notifyUser);

export default router;
