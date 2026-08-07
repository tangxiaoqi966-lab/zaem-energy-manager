import { OperationType, AlarmType, AlarmLevel } from '@prisma/client';
import {
  OperationLogResponse,
  AlarmLogResponse,
} from '@shared/index';
import prisma from '../../lib/prisma';
import { writeOperation, resolveAlarm as resolveAlarmLog } from '../../lib/logger';

interface PaginationParams {
  page: number;
  pageSize: number;
}

interface OperationLogQuery extends PaginationParams {
  type?: OperationType;
  userId?: string;
  roomId?: string;
  startDate?: string;
  endDate?: string;
}

interface AlarmLogQuery extends PaginationParams {
  type?: AlarmType;
  level?: AlarmLevel;
  roomId?: string;
  resolved?: boolean;
  startDate?: string;
  endDate?: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

class LogsService {
  public async getOperationLogs(
    params: OperationLogQuery,
  ): Promise<PaginatedResult<OperationLogResponse>> {
    const { page, pageSize, type, userId, roomId, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (userId) {
      where.userId = userId;
    }
    if (roomId) {
      where.roomId = roomId;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { username: true },
          },
          room: {
            select: {
              roomNumber: true,
              name: true,
              devices: {
                select: { name: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.operationLog.count({ where }),
    ]);

    const items: OperationLogResponse[] = logs.map((log) => ({
      id: log.id,
      type: log.type as unknown as OperationLogResponse['type'],
      userId: log.userId,
      username: log.user?.username ?? null,
      roomId: log.roomId,
      roomNumber: log.room?.roomNumber ?? null,
      displayName:
        log.room?.devices[0]?.name?.trim() ||
        log.room?.name?.trim() ||
        log.room?.roomNumber ||
        null,
      details: log.details,
      success: log.success,
      createdAt: log.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  public async getAlarmLogs(
    params: AlarmLogQuery,
  ): Promise<PaginatedResult<AlarmLogResponse>> {
    const { page, pageSize, type, level, roomId, resolved, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (level) {
      where.level = level;
    }
    if (roomId) {
      where.roomId = roomId;
    }
    if (resolved !== undefined) {
      where.resolved = resolved;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.alarmLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          room: {
            select: {
              roomNumber: true,
              name: true,
              devices: {
                select: { name: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.alarmLog.count({ where }),
    ]);

    const items: AlarmLogResponse[] = logs.map((log) => ({
      id: log.id,
      type: log.type as unknown as AlarmLogResponse['type'],
      level: log.level as unknown as AlarmLogResponse['level'],
      roomId: log.roomId,
      roomNumber: log.room?.roomNumber ?? null,
      displayName:
        log.room?.devices[0]?.name?.trim() ||
        log.room?.name?.trim() ||
        log.room?.roomNumber ||
        null,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
      resolved: log.resolved,
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  public async resolveAlarm(id: string, operatorUserId: string | null): Promise<boolean> {
    await resolveAlarmLog(id);

    await writeOperation(
      operatorUserId,
      OperationType.update_alarm,
      null,
      JSON.stringify({ alarmId: id, action: 'resolve' }),
      true,
    );

    return true;
  }
}

export const logsService = new LogsService();
export default LogsService;
