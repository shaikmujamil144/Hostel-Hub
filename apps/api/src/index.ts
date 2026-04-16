import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { connectDB } from './config/db';
import { notFound, errorHandler } from './middleware/errorMiddleware';
import { apiRateLimiter } from './middleware/rateLimitMiddleware';
import { requestContext } from './middleware/requestContext';
import authRoutes from './routes/authRoutes';
import roomRoutes from './routes/roomRoutes';
import bookingRoutes from './routes/bookingRoutes';
import studentRoutes from './routes/studentRoutes';
import paymentRoutes from './routes/paymentRoutes';
import complaintRoutes from './routes/complaintRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import auditRoutes from './routes/auditRoutes';
import notificationRoutes from './routes/notificationRoutes';
import hostelRoutes from './routes/hostelRoutes';
import { runAutoEscalationSweep } from './services/complaintEscalationService';
import { acquireDistributedLock, releaseDistributedLock } from './services/distributedLockService';
import { ensureDevelopmentBootstrapData } from './services/bootstrapService';

dotenv.config();

const configuredFrontendOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const defaultFrontendOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
const allowedOrigins = new Set([...defaultFrontendOrigins, ...configuredFrontendOrigins]);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return /^http:\/\/localhost:\d+$/.test(origin);
};

// Connect to MongoDB Atlas
connectDB();

const app = express();
const httpServer = createServer(app);

// Socket.io initialization for real-time complaints and notifications
export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
  },
});

app.use(requestContext);
app.use(
  pinoHttp({
    quietReqLogger: true,
    customProps: (req) => ({
      requestId: (req as any).requestId,
      tenantId: (req as any).tenantId,
    }),
  })
);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(
  express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString();
    },
  })
);
app.use(apiRateLimiter);

app.get('/', (_req, res) => {
  res.json({
    message: 'HostelHub API is running',
    health: '/api/health',
  });
});

// Basic Route structure (to be expanded)
app.get('/api/health', (req, res) => {
  res.json({ status: 'HostelHub API is running smoothly' });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/hostels', hostelRoutes);

app.use(notFound);
app.use(errorHandler);

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join_tenant', (tenantId: string) => {
    if (!tenantId) return;
    socket.join(`tenant:${tenantId}`);
  });

  // We can listen to events here or inside completely modular event files later
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
const AUTO_ESCALATION_ENABLED = String(process.env.AUTO_ESCALATION_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_ESCALATION_INTERVAL_MS = Math.max(Number(process.env.AUTO_ESCALATION_INTERVAL_MS || 300000), 60000);
const AUTO_ESCALATION_LOCK_TTL_MS = Math.max(
  Number(process.env.AUTO_ESCALATION_LOCK_TTL_MS || AUTO_ESCALATION_INTERVAL_MS * 2),
  120000
);
const AUTO_ESCALATION_LOCK_KEY = 'scheduler:auto-escalation';
let escalationSweepInProgress = false;

const startEscalationScheduler = () => {
  if (!AUTO_ESCALATION_ENABLED) {
    console.log('Auto escalation scheduler is disabled');
    return;
  }

  setInterval(async () => {
    if (escalationSweepInProgress) {
      return;
    }

    escalationSweepInProgress = true;
    try {
      const acquired = await acquireDistributedLock({
        key: AUTO_ESCALATION_LOCK_KEY,
        ttlMs: AUTO_ESCALATION_LOCK_TTL_MS,
      });
      if (!acquired) {
        return;
      }

      const result = await runAutoEscalationSweep({
        onEscalated: (tenantId, payload) => {
          io.to(`tenant:${tenantId}`).emit('complaint_escalated', payload);
        },
      });
      if (result.escalatedTotal > 0) {
        console.log(
          `Auto escalation sweep complete. Tenants: ${result.tenantsScanned}, escalated: ${result.escalatedTotal}`
        );
      }
    } catch (error: any) {
      console.error('Auto escalation sweep failed:', error?.message || error);
    } finally {
      try {
        await releaseDistributedLock(AUTO_ESCALATION_LOCK_KEY);
      } catch {
        // Lock has TTL fallback; ignore release failures.
      }
      escalationSweepInProgress = false;
    }
  }, AUTO_ESCALATION_INTERVAL_MS);

  console.log(`Auto escalation scheduler enabled: every ${AUTO_ESCALATION_INTERVAL_MS}ms`);
};

httpServer.on('error', (error: any) => {
  if (error?.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Assuming API is already running.`);
    process.exit(0);
  }

  throw error;
});

httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  void ensureDevelopmentBootstrapData();
  startEscalationScheduler();
});
