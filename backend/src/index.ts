import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config';
import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/admin/admin.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import listsRoutes from './modules/lists/lists.routes';
import supportRoutes from './modules/support/support.routes';
import templatesRoutes from './modules/templates/templates.routes';
import smtpRoutes from './modules/smtp/smtp.routes';
import cookiesRoutes from './modules/cookies/cookies.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import deliverabilityRoutes from './modules/deliverability/deliverability.routes';
import publicStatusRoutes from './modules/public-status/public-status.routes';
import unsubscribeRoutes from './modules/unsubscribe/unsubscribe.routes';
import { mailgunBounceWebhook } from './modules/webhooks/webhooks.controller';
import { attachWebSocketGateway, broadcastToUser } from './realtime/ws-gateway';
import { startRealtimeRedisSubscriber } from './realtime/redis-subscriber';

const app = express();

if (env.TRUST_PROXY !== false) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  })
);

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, origin);
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* Generous limit: dashboards poll multiple endpoints; many users may share one NAT IP. */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests from this network. Please wait a few minutes and try again.',
    },
  })
);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/smtp-servers', smtpRoutes);
app.use('/api/cookies', cookiesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/deliverability', deliverabilityRoutes);
app.use('/api/public/status', publicStatusRoutes);
app.use('/unsubscribe', unsubscribeRoutes);
app.post('/webhooks/mailgun/bounce', mailgunBounceWebhook);
app.post('/webhooks/mailgun/events', mailgunBounceWebhook);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
attachWebSocketGateway(server);
startRealtimeRedisSubscriber((userId, message) => {
  broadcastToUser(userId, message);
});

server.listen(env.PORT, () => {
  console.log(`[API] Server running on port ${env.PORT}`);
  console.log(`[API] WebSocket gateway at ws://localhost:${env.PORT}/ws`);
});
