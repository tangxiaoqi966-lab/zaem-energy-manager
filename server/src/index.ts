import 'dotenv/config';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import http from 'http';
import rateLimit from 'express-rate-limit';
import env from './config/env';
import { errorHandler, notFound } from './lib/errors';
import { initSocketIO } from './lib/socket';
import { setupSwagger } from './lib/swagger';
import { startCronJobs } from './lib/cron';
import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import energyRoutes from './modules/energy/energy.routes';
import systemRoutes from './modules/system/system.routes';
import logsRoutes from './modules/logs/logs.routes';

const app = express();

const corsOptions: CorsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  optionsSuccessStatus: 204,
};

app.use(express.json());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/logs', logsRoutes);

setupSwagger(app);

app.use(notFound);
app.use(errorHandler);

const httpServer = http.createServer(app);

initSocketIO(httpServer);

httpServer.listen(env.PORT, async () => {
  try {
    await startCronJobs();
    console.log(`listening on ${env.PORT}`);
  } catch {
  }
});
