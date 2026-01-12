import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { redisService } from './services/redis';
import { relayService } from './services/relay';
import authRoutes from './routes/auth';
import devicesRoutes from './routes/devices';
import notificationsRoutes from './routes/notifications';
import { rateLimit, RateLimitPresets } from './middleware/rateLimit';

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general API rate limiting
app.use('/api', rateLimit(RateLimitPresets.api));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    relay: {
      initialized: relayService.isInitialized(),
      connectedDevices: relayService.getConnectedDeviceCount(),
    },
  });
});

// API routes
app.get('/api/v1', (_req, res) => {
  res.json({
    message: 'NZR Dev Plugin Relay API',
    version: 'v1',
  });
});

// Auth routes
app.use('/api/v1', authRoutes);

// Devices routes
app.use('/api/v1/devices', devicesRoutes);

// Notifications routes
app.use('/api/v1/notifications', notificationsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
});

// Start server
const PORT = config.port;

async function startServer() {
  try {
    // Connect to Redis
    await redisService.connect();
    logger.info('Connected to Redis');

    // Initialize Socket.IO relay service
    relayService.initialize(httpServer);
    logger.info('Relay service initialized');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Relay server started on port ${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Socket.IO relay: ws://localhost:${PORT}/relay`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  httpServer.close(async () => {
    await redisService.disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, httpServer };
