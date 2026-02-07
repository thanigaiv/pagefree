import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import { env } from './config/env.js';
import { prisma, disconnectDatabase } from './config/database.js';
import { auditMiddleware } from './middleware/auditLogger.js';
import { auditRouter } from './routes/audit.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { apiKeyRouter } from './routes/apiKey.routes.js';
import { teamRouter } from './routes/team.routes.js';
import { userRouter } from './routes/user.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { mobileRouter } from './routes/mobile.routes.js';
import { integrationRouter } from './routes/integration.routes.js';
import { scheduleRouter } from './routes/schedule.routes.js';
import { onCallRouter } from './routes/oncall.routes.js';
import calendarSyncRouter from './routes/calendarSync.routes.js';
import { incidentRoutes } from './routes/incident.routes.js';
import { escalationPolicyRoutes } from './routes/escalation-policy.routes.js';
import { alertRoutes } from './routes/alert.routes.js';
import { scheduleAuditCleanup } from './jobs/auditCleanup.js';
import { auditService } from './services/audit.service.js';
import { configureLocalStrategy } from './auth/strategies/local.js';
import { sessionMiddleware } from './auth/session.js';
import { configureOktaStrategy } from './auth/strategies/okta.js';
import { oktaWebhookRouter } from './webhooks/okta.js';
import { scimRouter } from './auth/scim/routes.js';
import { alertWebhookRouter } from './webhooks/alert-receiver.js';
import { slackInteractionsRouter } from './routes/webhooks/slack-interactions.js';
import { slackCommandsRouter } from './routes/webhooks/slack-commands.js';
import { magicLinksRouter } from './routes/magic-links.js';
import { twilioWebhooksRouter } from './routes/webhooks/twilio-webhooks.js';
import { startEscalationWorker, setupGracefulShutdown } from './workers/escalation.worker.js';

export const app = express();

// Security headers
app.use(helmet());

// CORS for frontend
app.use(cors({
  origin: env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Session middleware (must be before Passport)
app.use(sessionMiddleware);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport strategies
configureLocalStrategy();
configureOktaStrategy();

// Alert webhooks (uses its own body parser for raw body capture)
// MUST be before express.json() to capture raw body for signature verification
app.use('/webhooks/alerts', alertWebhookRouter);

// Slack webhooks with raw body capture for signature verification
// MUST be before the main body parsers
app.use('/webhooks/slack', express.urlencoded({
  extended: true,
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Okta webhooks (mount before auth middleware - uses its own auth)
app.use('/webhooks/okta', oktaWebhookRouter);

// Slack webhooks (mount before auth middleware - uses signature-based auth)
app.use('/webhooks/slack/interactions', slackInteractionsRouter);
app.use('/webhooks/slack/commands', slackCommandsRouter);

// Twilio webhooks (mount before auth middleware - uses signature-based auth)
app.use('/webhooks/twilio', twilioWebhooksRouter);

// Magic links (public routes - token is the authorization)
app.use('/magic', magicLinksRouter);

// SCIM endpoints (mount before auth middleware - uses its own auth)
app.use('/scim/v2', scimRouter);

// Audit logging middleware (must be after body parsing)
app.use(auditMiddleware);

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'OnCall Platform API',
    version: '1.0.0',
    status: 'running'
  });
});

// API routes
app.use('/api/audit', auditRouter);
app.use('/auth', authRouter);
app.use('/api/keys', apiKeyRouter);
app.use('/api/teams', teamRouter);
app.use('/api/users', userRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/integrations', integrationRouter);
app.use('/api/schedules', scheduleRouter);
app.use('/api/oncall', onCallRouter);
app.use('/api/calendar', calendarSyncRouter);
app.use('/api/incidents', incidentRoutes);
app.use('/api/escalation-policies', escalationPolicyRoutes);
app.use('/api/alerts', alertRoutes);

// Global error handler (last middleware)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  // Don't expose internal errors
  res.status(500).json({
    error: 'Internal server error',
    ...(env.NODE_ENV === 'development' && { details: err.message })
  });
});

// Start server only when not imported by tests
if (process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(env.PORT, 10);

  const server = app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Environment: ${env.NODE_ENV}`);

    // Log server startup event
    await auditService.log({
      action: 'system.startup',
      metadata: { version: '1.0.0', port: PORT },
      severity: 'INFO',
    });

    // Schedule audit cleanup in production
    if (env.NODE_ENV === 'production') {
      scheduleAuditCleanup();
    } else {
      console.log('📝 Audit cleanup scheduling skipped (development mode)');
    }

    // Start background workers
    try {
      await startEscalationWorker();
      setupGracefulShutdown();
      console.log('⚙️  Background workers started');
    } catch (error) {
      console.error('❌ Failed to start background workers - continuing without escalation', error);
      // Don't crash server if Redis unavailable, just log
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');

    server.close(async () => {
      console.log('✅ HTTP server closed');
      await disconnectDatabase();
      console.log('✅ Database disconnected');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
