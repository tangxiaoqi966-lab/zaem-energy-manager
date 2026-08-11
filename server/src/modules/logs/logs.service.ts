import { OperationType, AlarmType, AlarmLevel } from '@prisma/client';
import {
  OperationLogResponse,
  AlarmLogResponse,
} from '@shared/index';
import prisma from '../../lib/prisma';
import { writeOperation, resolveAlarm as resolveAlarmLog } from '../../lib/logger';
import {
  formatOperationDetailsText,
  getOperationActorLabel,
  getOperationTargetInfo,
  OperationActorContext,
} from '../../lib/operation-log';

interface PaginationParams {
  page: number;
  pageSize: number;
}

interface OperationLogQuery extends PaginationParams {
  type?: OperationType;
  userId?: string;
  roomId?: string;
  roomNumber?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

interface AlarmLogQuery extends PaginationParams {
  type?: AlarmType;
  level?: AlarmLevel;
  roomNumber?: string;
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
    const { page, pageSize, type, userId, roomId, roomNumber, keyword, startDate, endDate } = params;
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
    if (roomNumber) {
      where.room = {
        roomNumber,
      };
    }
    if (keyword) {
      where.details = {
        contains: keyword,
      };
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

    const items: OperationLogResponse[] = logs.map((log) => {
      const targetInfo = getOperationTargetInfo(log.details);
      const detailsText = formatOperationDetailsText(log.type, log.details);
      const detailsWithResult = detailsText
        ? `${detailsText}\n结果：${log.success ? '成功' : '失败'}`
        : `结果：${log.success ? '成功' : '失败'}`;

      return {
        id: log.id,
        type: log.type as unknown as OperationLogResponse['type'],
        userId: log.userId,
        username: log.user?.username ?? null,
        actorLabel: getOperationActorLabel(log.user?.username ?? null, log.details),
        roomId: log.roomId,
        roomNumber: log.room?.roomNumber ?? targetInfo.roomNumber,
        displayName:
          log.room?.devices[0]?.name?.trim() ||
          log.room?.name?.trim() ||
          log.room?.roomNumber ||
          targetInfo.displayName ||
          targetInfo.deviceName ||
          targetInfo.roomName ||
          targetInfo.roomNumber,
        details: log.details,
        detailsText: detailsWithResult,
        success: log.success,
        createdAt: log.createdAt.toISOString(),
      };
    });

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
    const { page, pageSize, type, level, roomNumber, resolved, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (level) {
      where.level = level;
    }
    if (roomNumber) {
      where.room = {
        roomNumber,
      };
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

  public async clearAlarmLogs(
    params: Omit<AlarmLogQuery, 'page' | 'pageSize'>,
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<{ deletedCount: number }> {
    const { type, level, roomNumber, resolved, startDate, endDate } = params;

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (level) {
      where.level = level;
    }
    if (roomNumber) {
      where.room = {
        roomNumber,
      };
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

    const result = await prisma.alarmLog.deleteMany({ where });

    await writeOperation(
      operatorUserId,
      OperationType.update_alarm,
      null,
      {
        action: 'clear',
        actionLabel: '清除报警记录',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        deletedCount: result.count,
        filters: {
          type: type ?? null,
          level: level ?? null,
          roomNumber: roomNumber ?? null,
          resolved: resolved ?? null,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
        },
      },
      true,
    );

    return { deletedCount: result.count };
  }

  public async resolveAlarm(
    id: string,
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<boolean> {
    const alarm = await prisma.alarmLog.findUnique({
      where: { id },
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
    });

    await resolveAlarmLog(id);

    const isWarningAlarm =
      alarm?.type === AlarmType.limit_80 ||
      alarm?.type === AlarmType.limit_90 ||
      alarm?.type === AlarmType.limit_95;
    const roomDisplayName =
      alarm?.room?.devices[0]?.name?.trim() ||
      alarm?.room?.name?.trim() ||
      alarm?.room?.roomNumber ||
      null;

    await writeOperation(
      operatorUserId,
      OperationType.update_alarm,
      alarm?.roomId ?? null,
      {
        action: 'resolve_alarm',
        actionLabel: isWarningAlarm ? '标记预警已读' : '处理报警',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        roomNumber: alarm?.room?.roomNumber ?? null,
        roomName: alarm?.room?.name ?? null,
        displayName: roomDisplayName,
        note: isWarningAlarm
          ? `预警已标记已读：${alarm?.message ?? id}`
          : `报警已标记处理：${alarm?.message ?? id}`,
      },
      true,
    );

    return true;
  }
}

export const logsService = new LogsService();
export default LogsService;
