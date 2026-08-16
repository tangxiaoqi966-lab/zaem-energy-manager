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
  getOperationCategory,
  getOperationCategoryLabel,
  getOperationResultMeta,
  getOperationSourceLabel,
  getOperationTargetInfo,
  OperationActorContext,
  parseOperationDetailsPayload,
} from '../../lib/operation-log';
import { formatRoomDisplayName } from '../../lib/room-display';

interface PaginationParams {
  page: number;
  pageSize: number;
}

interface OperationLogQuery extends PaginationParams {
  siteId?: string;
  type?: OperationType;
  category?: string;
  userId?: string;
  roomId?: string;
  roomNumber?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

interface AlarmLogQuery extends PaginationParams {
  siteId?: string;
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
    const { page, pageSize, siteId, type, category, userId, roomId, roomNumber, keyword, startDate, endDate } = params;
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
        ...(siteId ? { siteId } : {}),
      };
    } else if (siteId) {
      where.OR = [
        { room: { siteId } },
        { roomId: null },
      ];
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

    const include = {
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
    } as const;

    const mapLog = (log: any): OperationLogResponse => {
      const targetInfo = getOperationTargetInfo(log.details);
      const detailsText = formatOperationDetailsText(log.type, log.details);
      const resultMeta = getOperationResultMeta(log.success, log.details);
      const parsedDetails = parseOperationDetailsPayload(log.details);
      const sourceLabel = parsedDetails
        ? (parsedDetails.sourceLabel || getOperationSourceLabel(parsedDetails.source))
        : null;
      const resolvedCategory = getOperationCategory(log.type, log.details);
      const detailsWithResult = detailsText
        ? `${detailsText}\n结果：${resultMeta.label}`
        : `结果：${resultMeta.label}`;

      return {
        id: log.id,
        type: log.type as unknown as OperationLogResponse['type'],
        category: resolvedCategory,
        categoryLabel: getOperationCategoryLabel(resolvedCategory),
        userId: log.userId,
        username: log.user?.username ?? null,
        actorLabel: getOperationActorLabel(log.user?.username ?? null, log.details),
        sourceLabel,
        roomId: log.roomId,
        roomNumber: log.room?.roomNumber ?? targetInfo.roomNumber,
        displayName:
          (log.room?.roomNumber
            ? formatRoomDisplayName(log.room.roomNumber, log.room.name)
            : null) ||
          targetInfo.displayName ||
          targetInfo.roomName ||
          targetInfo.deviceName ||
          targetInfo.roomNumber,
        details: log.details,
        detailsText: detailsWithResult,
        success: log.success,
        resultLabel: resultMeta.label,
        resultTone: resultMeta.tone,
        createdAt: log.createdAt.toISOString(),
      };
    };

    if (category) {
      const allLogs = await prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include,
      });
      const mapped = allLogs.map(mapLog).filter((item) => item.category === category);
      const items = mapped.slice(skip, skip + pageSize);
      return {
        items,
        total: mapped.length,
        page,
        pageSize,
      };
    }

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      prisma.operationLog.count({ where }),
    ]);

    const items: OperationLogResponse[] = logs.map(mapLog);

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
    const { page, pageSize, siteId, type, level, roomNumber, resolved, startDate, endDate } = params;
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
        ...(siteId ? { siteId } : {}),
      };
    } else if (siteId) {
      where.room = { siteId };
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
        (log.room?.roomNumber
          ? formatRoomDisplayName(log.room.roomNumber, log.room.name)
          : null) ||
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
    const { siteId, type, level, roomNumber, resolved, startDate, endDate } = params;

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
        ...(siteId ? { siteId } : {}),
      };
    } else if (siteId) {
      where.room = { siteId };
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
          siteId: siteId ?? null,
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
      alarm?.room?.roomNumber
        ? formatRoomDisplayName(alarm.room.roomNumber, alarm.room.name)
        : null;

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
