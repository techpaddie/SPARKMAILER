import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import * as supportController from './support.controller';

const router = Router();

router.use(authMiddleware);

router.get('/tickets', supportController.listTickets);
router.get('/tickets/:id', supportController.getTicket);
router.post('/tickets', supportController.createTicket);
router.post('/tickets/:id/messages', supportController.addMessage);
router.patch('/tickets/:id/status', supportController.updateTicketStatus);
router.delete('/tickets/:id', supportController.deleteTicket);

export default router;

