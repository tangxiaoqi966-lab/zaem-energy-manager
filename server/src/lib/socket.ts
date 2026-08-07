import { Server, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { getDashboardSummary } from '../modules/dashboard/dashboard.service';
import { getRoomDetail } from '../modules/energy/energy.service';

let io: Server | null = null;
let dashboardInterval: NodeJS.Timeout | null = null;

export function initSocketIO(httpServer: HTTPServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        next(new Error('未授权'));
        return;
      }
      jwt.verify(token, env.JWT_SECRET);
      next();
    } catch {
      next(new Error('未授权'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socket.on('disconnect', () => {
      void socket;
    });
  });

  startDashboardBroadcast();

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO 未初始化');
  }
  return io;
}

function startDashboardBroadcast(): void {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
  }
  dashboardInterval = setInterval(() => {
    broadcastDashboard().catch(() => {});
  }, 5000);
}

export async function broadcastDashboard(): Promise<void> {
  try {
    if (!io) return;
    const data = await getDashboardSummary();
    io.emit('dashboard', data);
  } catch {
  }
}

export async function broadcastRoom(roomId: string): Promise<void> {
  try {
    if (!io) return;
    const data = await getRoomDetail(roomId);
    io.emit(`room:${roomId}`, data);
  } catch {
  }
}

export function broadcastAlarm(alarm: unknown): void {
  try {
    if (!io) return;
    io.emit('alarm:new', alarm);
  } catch {
  }
}
