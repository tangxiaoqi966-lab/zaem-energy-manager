import prisma from '../../lib/prisma';
import { xiaomiAdapter } from '../system/xiaomi.adapter';
import { writeOperation } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import { systemService } from '../system/system.service';
import { broadcastDashboard } from '../../lib/socket';
import {
  RoomStatus,
  AlarmType,
  AlarmLevel,
  OperationType,
  DeviceStatus as PrismaDeviceStatus,
} from '@prisma/client';
import * as shared_types from '@shared/index';
import {
  RealtimeEnergyData,
  RoomEnergyDetail,
  HourlyDataPoint,
  DailyDataPoint,
  MonthlyDataPoint,
  RankingItem,
  DeviceItem,
  DeviceStatus,
} from '@shared/index';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  addDays,
  getBusinessDate,
  getDateKey,
} from '../../lib/business-time';
import { OperationActorContext } from '../../lib/operation-log';

const ROOM_POWER_ACTION_WINDOW_MS = 3 * 60 * 1000;

const PRISMA_TO_SHARED_DEVICE_STATUS_ENERGY: Record<PrismaDeviceStatus, DeviceStatus> =
  {
    online: DeviceStatus.ONLINE,
    offline: DeviceStatus.OFFLINE,
    unknown: DeviceStatus.UNKNOWN,
  };

function toDeviceItem(d: any): DeviceItem {
  const prismaStatus = (d.status ?? 'unknown') as PrismaDeviceStatus;
  const sharedStatus =
    PRISMA_TO_SHARED_DEVICE_STATUS_ENERGY[prismaStatus] ?? DeviceStatus.UNKNOWN;
  return {
    id: d.id,
    did: d.did,
    name: d.name,
    model: d.model,
    status: sharedStatus,
    roomId: d.roomId ?? null,
    roomNumber: d.room?.roomNumber ?? null,
    power: d.power ?? null,
    powerW: d.powerW ?? null,
    currentA: d.currentA ?? null,
    voltageV: d.voltageV ?? null,
    totalKwh: d.totalKwh ?? null,
    lastSyncAt: d.lastSyncAt ? new Date(d.lastSyncAt).toISOString() : null,
  };
}

async function assertRoomPowerActionAllowed(
  roomId: string,
  actionType: 'cutoff_power' | 'restore_power',
  operatorUserId: string | null | undefined,
  auto: boolean,
  actorContext?: OperationActorContext,
) {
  const since = new Date(Date.now() - ROOM_POWER_ACTION_WINDOW_MS);
  const recentActions = await prisma.operationLog.findMany({
    where: {
      roomId,
      success: true,
      type: {
        in: [OperationType.cutoff_power, OperationType.restore_power],
      },
      createdAt: {
        gte: since,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      type: true,
      createdAt: true,
    },
  });

  const sameAction = recentActions.find((item) => item.type === actionType);
  if (sameAction) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (sameAction.createdAt.getTime() + ROOM_POWER_ACTION_WINDOW_MS - Date.now()) / 1000,
      ),
    );
    const actionLabel = actionType === OperationType.cutoff_power ? '断电' : '恢复供电';
    const message = `同一房间 3 分钟内不能重复${actionLabel}，请 ${retryAfterSeconds} 秒后再试`;

    await writeOperation(
      operatorUserId ?? null,
      actionType,
      roomId,
      {
        action: auto ? `auto_${actionType}` : actionType,
        actionLabel: actionType === OperationType.cutoff_power ? '断电被拦截' : '恢复供电被拦截',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        blocked: true,
        reason: 'duplicate_action_in_window',
        retryAfterSeconds,
      },
      false,
    );

    throw new AppError(429, 'ROOM_POWER_ACTION_COOLDOWN', message, {
      retryAfterSeconds,
    });
  }

  if (recentActions.length >= 2) {
    const oldestRecentAction = recentActions[recentActions.length - 1];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (oldestRecentAction.createdAt.getTime() + ROOM_POWER_ACTION_WINDOW_MS - Date.now()) /
          1000,
      ),
    );
    const message = `同一房间 3 分钟内最多只允许 1 次断电和 1 次恢复，请 ${retryAfterSeconds} 秒后再试`;

    await writeOperation(
      operatorUserId ?? null,
      actionType,
      roomId,
      {
        action: auto ? `auto_${actionType}` : actionType,
        actionLabel: actionType === OperationType.cutoff_power ? '断电被拦截' : '恢复供电被拦截',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        blocked: true,
        reason: 'too_many_actions_in_window',
        retryAfterSeconds,
      },
      false,
    );

    throw new AppError(429, 'ROOM_POWER_ACTION_COOLDOWN', message, {
      retryAfterSeconds,
    });
  }
}

export async function computeRoomRealtime(room: {
  id: string;
  roomNumber: string;
  name?: string | null;
  cutoff: boolean;
  status?: any;
  energyLimit?: { dailyLimit: number; enabled?: boolean } | null;
  devices?: Array<{
    name?: string | null;
    status: any;
    powerW?: number | null;
    currentA?: number | null;
    voltageV?: number | null;
  }>;
}, businessTimeZone?: string): Promise<RealtimeEnergyData> {
  const timeZone =
    businessTimeZone ??
    await systemService.getSetting('businessTimezone', DEFAULT_BUSINESS_TIMEZONE);
  const today = getBusinessDate(new Date(), timeZone);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const [todayRecord, yesterdayRecord, monthAgg, yearAgg] = await Promise.all([
    prisma.dailyEnergy.findUnique({ where: { roomId_date: { roomId: room.id, date: today } } }),
    prisma.dailyEnergy.findUnique({ where: { roomId_date: { roomId: room.id, date: yesterday } } }),
    prisma.dailyEnergy.aggregate({
      where: { roomId: room.id, date: { gte: monthStart, lt: tomorrow } },
      _sum: { usageKwh: true },
    }),
    prisma.dailyEnergy.aggregate({
      where: { roomId: room.id, date: { gte: yearStart, lt: tomorrow } },
      _sum: { usageKwh: true },
    }),
  ]);

  const todayUsage = todayRecord?.usageKwh ?? 0;
  const yesterdayUsage = yesterdayRecord?.usageKwh ?? 0;
  const monthUsage = monthAgg._sum.usageKwh ?? 0;
  const yearUsage = yearAgg._sum.usageKwh ?? 0;

  const dailyLimit = room.energyLimit?.dailyLimit ?? 10;
  const limitEnabled = room.energyLimit?.enabled ?? false;
  const usagePercent = dailyLimit > 0 ? Math.min(100, (todayUsage / dailyLimit) * 100) : 0;

  let devices = room.devices as any;
  if (!devices) {
    devices = await prisma.device.findMany({ where: { roomId: room.id }, include: { room: { select: { roomNumber: true } } } });
  }
  const onlineDevices = devices.filter((d: any) => d.status === 'online');
  const deviceOnline = onlineDevices.length > 0 || devices.length === 0;
  const mainDevice = onlineDevices[0] || devices[0];
  const displayName =
    mainDevice?.name?.trim() ||
    devices[0]?.name?.trim() ||
    room.name?.trim() ||
    room.roomNumber;

  const power = mainDevice?.powerW ?? 0;
  const current = mainDevice?.currentA ?? 0;
  const voltage = mainDevice?.voltageV ?? 220;

  let status: shared_types.RoomStatus;
  if (room.cutoff) {
    status = shared_types.RoomStatus.CUTOFF;
  } else if (devices.length > 0 && !deviceOnline) {
    status = shared_types.RoomStatus.OFFLINE;
  } else if (limitEnabled && usagePercent >= 95) {
    status = shared_types.RoomStatus.WARNING_95;
  } else if (limitEnabled && usagePercent >= 90) {
    status = shared_types.RoomStatus.WARNING_90;
  } else if (limitEnabled && usagePercent >= 80) {
    status = shared_types.RoomStatus.WARNING_80;
  } else {
    status = shared_types.RoomStatus.NORMAL;
  }

  return {
    roomId: room.id,
    roomNumber: room.roomNumber,
    displayName,
    power,
    current,
    voltage,
    todayUsage,
    yesterdayUsage,
    monthUsage,
    yearUsage,
    status,
    usagePercent,
    dailyLimit,
    limitEnabled,
    deviceOnline,
    cutoff: room.cutoff,
    devices: devices.map(toDeviceItem),
  };
}

export async function getRooms(): Promise<RealtimeEnergyData[]> {
  await xiaomiAdapter.ensureRealtimeFresh();
  await xiaomiAdapter.ensureDailyHistoryFresh();
  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );

  const rooms = await prisma.room.findMany({
    include: {
      energyLimit: true,
      devices: { include: { room: { select: { roomNumber: true } } } },
    },
  });
  return Promise.all(rooms.map((r) => computeRoomRealtime(r, businessTimeZone)));
}

export async function getRoomDetail(roomId: string): Promise<RoomEnergyDetail> {
  await xiaomiAdapter.ensureRealtimeFresh();
  await xiaomiAdapter.ensureDailyHistoryFresh();
  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      energyLimit: true,
      devices: { include: { room: { select: { roomNumber: true } } } },
    },
  });
  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', '房间不存在');
  }

  const realtime = await computeRoomRealtime(room, businessTimeZone);
  const devices = room.devices.map(toDeviceItem);

  const today = getBusinessDate(new Date(), businessTimeZone);
  const today24h = (await xiaomiAdapter.getRoomTodayHourlyUsage(
    roomId,
    businessTimeZone,
  )) as HourlyDataPoint[];

  const lastCompleteDay = addDays(today, -1);
  const sevenDaysAgo = addDays(lastCompleteDay, -6);
  const last7DaysRaw = await prisma.dailyEnergy.findMany({
    where: { roomId, date: { gte: sevenDaysAgo, lte: lastCompleteDay } },
    orderBy: { date: 'asc' },
  });
  const last7Days: DailyDataPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(lastCompleteDay, -i);
    const dateStr = getDateKey(d);
    const rec = last7DaysRaw.find(x => {
      const xd = new Date(x.date);
      return getDateKey(xd) === dateStr;
    });
    last7Days.push({ date: dateStr, usage: rec?.usageKwh ?? 0 });
  }

  const thirtyDaysAgo = addDays(lastCompleteDay, -29);
  const last30DaysRaw = await prisma.dailyEnergy.findMany({
    where: { roomId, date: { gte: thirtyDaysAgo, lte: lastCompleteDay } },
    orderBy: { date: 'asc' },
  });
  const last30Days: DailyDataPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(lastCompleteDay, -i);
    const dateStr = getDateKey(d);
    const rec = last30DaysRaw.find(x => {
      const xd = new Date(x.date);
      return getDateKey(xd) === dateStr;
    });
    last30Days.push({ date: dateStr, usage: rec?.usageKwh ?? 0 });
  }

  const now = getBusinessDate(new Date(), businessTimeZone);
  const last12Months: MonthlyDataPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const monthStart = new Date(y, m - 1, 1);
    const nextMonthStart = new Date(y, m, 1);
    const rec = await prisma.dailyEnergy.aggregate({
      where: {
        roomId,
        date: { gte: monthStart, lt: nextMonthStart },
      },
      _sum: { usageKwh: true },
    });
    last12Months.push({ year: y, month: m, usage: rec._sum.usageKwh ?? 0 });
  }

  return { realtime, today24h, last7Days, last30Days, last12Months, devices };
}

export async function updateEnergyLimit(
  roomId: string,
  dailyLimit: number,
  operatorUserId: string,
  enabled?: boolean,
  actorContext?: OperationActorContext,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', '房间不存在');
  }
  if (dailyLimit < 0) {
    throw new AppError(400, 'INVALID_LIMIT', '限额值无效');
  }

  const limit = await prisma.energyLimit.upsert({
    where: { roomId },
    update: {
      dailyLimit,
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    },
    create: {
      roomId,
      dailyLimit,
      enabled: typeof enabled === 'boolean' ? enabled : false,
    },
  });

  await writeOperation(
    operatorUserId,
    OperationType.update_limit,
    roomId,
    {
      action: 'update_limit',
      actionLabel: '修改日限额',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      roomNumber: room.roomNumber,
      roomName: room.name,
      displayName: room.name || room.roomNumber,
      dailyLimit,
      limitEnabled: limit.enabled,
      note: '更新成功',
    },
    true,
  );

  return limit;
}

export async function getEnergyLimits() {
  const items = await prisma.energyLimit.findMany({
    include: {
      room: {
        include: {
          devices: {
            select: { name: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  return items.map((item) => ({
    ...item,
    displayName:
      item.room.devices[0]?.name?.trim() ||
      item.room.name?.trim() ||
      item.room.roomNumber,
  }));
}

export async function bulkUpdateLimitEnabled(
  enabled: boolean,
  operatorUserId: string,
  actorContext?: OperationActorContext,
): Promise<{ ok: boolean; enabled: boolean; total: number }> {
  const rooms = await prisma.room.findMany({
    select: {
      id: true,
      energyLimit: {
        select: { dailyLimit: true },
      },
    },
  });

  for (const room of rooms) {
    await prisma.energyLimit.upsert({
      where: { roomId: room.id },
      update: { enabled },
      create: {
        roomId: room.id,
        dailyLimit: room.energyLimit?.dailyLimit ?? 10,
        enabled,
      },
    });
  }

  await writeOperation(
    operatorUserId,
    OperationType.update_limit,
    null,
    {
      action: 'bulk_limit_enabled',
      actionLabel: enabled ? '批量开启限额断电' : '批量关闭限额断电',
      source: actorContext?.source,
      sourceLabel: actorContext?.sourceLabel,
      limitEnabled: enabled,
      totalCount: rooms.length,
    },
    true,
  );

  await broadcastDashboard().catch(() => {});

  return {
    ok: true,
    enabled,
    total: rooms.length,
  };
}

export async function checkAndTriggerAlarms(roomId: string): Promise<RoomStatus> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { energyLimit: true, devices: true },
  });
  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', '房间不存在');
  }

  const realtime = await computeRoomRealtime(room);

  const [alarmRatio80, alarmRatio90, alarmRatio95] = await Promise.all([
    systemService.getSetting('alarmRatio80', 0.8),
    systemService.getSetting('alarmRatio90', 0.9),
    systemService.getSetting('alarmRatio95', 0.95),
  ]);

  const threshold80 = alarmRatio80 * 100;
  const threshold90 = alarmRatio90 * 100;
  const threshold95 = alarmRatio95 * 100;

  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );
  const today = getBusinessDate(new Date(), businessTimeZone);
  const tomorrow = addDays(today, 1);

  const percent = realtime.usagePercent;
  if (realtime.dailyLimit == null || realtime.dailyLimit <= 0) {
    await prisma.room.update({
      where: { id: roomId },
      data: { status: realtime.status as any },
    });
    return realtime.status;
  }

  const warningAlarms: Array<{
    type: AlarmType;
    level: AlarmLevel;
    threshold: number;
    message: string;
  }> = [
    {
      type: AlarmType.limit_80,
      level: AlarmLevel.warning,
      threshold: threshold80,
      message: `${realtime.displayName}今日用电已超过${threshold80}%限额`,
    },
    {
      type: AlarmType.limit_90,
      level: AlarmLevel.danger,
      threshold: threshold90,
      message: `${realtime.displayName}今日用电已超过${threshold90}%限额`,
    },
    {
      type: AlarmType.limit_95,
      level: AlarmLevel.critical,
      threshold: threshold95,
      message: `${realtime.displayName}今日用电已超过${threshold95}%限额`,
    },
  ];

  for (const alarm of warningAlarms) {
    const shouldKeepOpen = percent >= alarm.threshold && !room.cutoff;
    if (shouldKeepOpen) {
      const existing = await prisma.alarmLog.findFirst({
        where: {
          roomId,
          type: alarm.type,
          resolved: false,
          createdAt: { gte: today, lt: tomorrow },
        },
      });
      if (!existing) {
        await prisma.alarmLog.create({
          data: {
            type: alarm.type,
            level: alarm.level,
            roomId,
            message: alarm.message,
            resolved: false,
          },
        });
      }
      continue;
    }

    await prisma.alarmLog.updateMany({
      where: {
        roomId,
        type: alarm.type,
        resolved: false,
        createdAt: { gte: today, lt: tomorrow },
      },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  await prisma.room.update({
    where: { id: roomId },
    data: { status: realtime.status as any },
  });

  return realtime.status;
}

export async function cutoffPower(
  roomId: string,
  operatorUserId: string | null | undefined,
  auto: boolean = false,
  actorContext?: OperationActorContext,
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { devices: true, energyLimit: true },
  });
  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', '房间不存在');
  }

  await assertRoomPowerActionAllowed(
    roomId,
    OperationType.cutoff_power,
    operatorUserId,
    auto,
    actorContext,
  );

  const roomDisplayName =
    room.devices[0]?.name?.trim() || room.name?.trim() || room.roomNumber;
  const realtimeBeforeAction = await computeRoomRealtime(room);

  const controllableDevices = room.devices;
  if (controllableDevices.length === 0) {
    await writeOperation(
      operatorUserId ?? null,
      OperationType.cutoff_power,
      roomId,
      {
        action: auto ? 'auto_cutoff' : 'manual_cutoff',
        actionLabel: auto ? '自动断电失败' : '手动断电失败',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        roomNumber: room.roomNumber,
        roomName: room.name,
        displayName: roomDisplayName,
        error: '没有可控制的设备',
      },
      false,
    );
    throw new AppError(400, 'NO_CONTROLLABLE_DEVICES', '没有可控制的设备，无法执行断电');
  }

  const failedDevices: string[] = [];
  for (const device of controllableDevices) {
    try {
      await xiaomiAdapter.turnOff(device.did, operatorUserId, {
        ...(actorContext ?? {}),
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
      });
    } catch {
      failedDevices.push(device.did);
    }
  }

  if (failedDevices.length > 0) {
    await writeOperation(
      operatorUserId ?? null,
      OperationType.cutoff_power,
      roomId,
      {
        action: auto ? 'auto_cutoff' : 'manual_cutoff',
        actionLabel: auto ? '自动断电失败' : '手动断电失败',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        roomNumber: room.roomNumber,
        roomName: room.name,
        displayName: roomDisplayName,
        failedDevices,
        error: '部分设备断电失败',
      },
      false,
    );
    throw new AppError(
      502,
      'ROOM_CUTOFF_FAILED',
      `以下设备断电失败：${failedDevices.join(', ')}`,
    );
  }

  const updatedRoom = await prisma.room.update({
    where: { id: roomId },
    data: { cutoff: true, status: RoomStatus.cutoff },
  });

  await writeOperation(
    operatorUserId ?? null,
    OperationType.cutoff_power,
    roomId,
    {
      action: auto ? 'auto_cutoff' : 'manual_cutoff',
      actionLabel: auto ? '自动断电' : '手动断电',
      source: auto ? 'system_auto' : actorContext?.source,
      sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
      roomNumber: room.roomNumber,
      roomName: room.name,
      displayName: roomDisplayName,
      note: '执行成功',
    },
    true,
  );

  await prisma.alarmLog.updateMany({
    where: {
      roomId,
      resolved: false,
      type: { in: [AlarmType.limit_80, AlarmType.limit_90, AlarmType.limit_95] },
    },
    data: {
      resolved: true,
      resolvedAt: new Date(),
    },
  });

  if (!room.cutoff && realtimeBeforeAction.limitEnabled && realtimeBeforeAction.usagePercent >= 100) {
    await prisma.alarmLog.create({
      data: {
        type: AlarmType.limit_reached,
        level: AlarmLevel.critical,
        roomId,
        message: auto
          ? `${roomDisplayName}已超出日限额，系统已自动断电`
          : `${roomDisplayName}已超出日限额，已执行手动断电`,
        resolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  return updatedRoom;
}

export async function restorePower(
  roomId: string,
  operatorUserId: string | null,
  auto: boolean = false,
  actorContext?: OperationActorContext,
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { devices: true, energyLimit: true },
  });
  if (!room) {
    throw new AppError(404, 'ROOM_NOT_FOUND', '房间不存在');
  }

  await assertRoomPowerActionAllowed(
    roomId,
    OperationType.restore_power,
    operatorUserId,
    auto,
    actorContext,
  );

  const roomDisplayName =
    room.devices[0]?.name?.trim() || room.name?.trim() || room.roomNumber;

  const controllableDevices = room.devices;
  if (controllableDevices.length === 0) {
    await writeOperation(
      operatorUserId,
      OperationType.restore_power,
      roomId,
      {
        action: auto ? 'auto_restore' : 'manual_restore',
        actionLabel: auto ? '自动恢复供电失败' : '手动恢复供电失败',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        roomNumber: room.roomNumber,
        roomName: room.name,
        displayName: roomDisplayName,
        error: '没有可控制的设备',
      },
      false,
    );
    throw new AppError(400, 'NO_CONTROLLABLE_DEVICES', '没有可控制的设备，无法恢复供电');
  }

  const failedDevices: string[] = [];
  for (const device of controllableDevices) {
    try {
      await xiaomiAdapter.turnOn(device.did, operatorUserId ?? undefined, {
        ...(actorContext ?? {}),
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
      });
    } catch {
      failedDevices.push(device.did);
    }
  }

  if (failedDevices.length > 0) {
    await writeOperation(
      operatorUserId,
      OperationType.restore_power,
      roomId,
      {
        action: auto ? 'auto_restore' : 'manual_restore',
        actionLabel: auto ? '自动恢复供电失败' : '手动恢复供电失败',
        source: auto ? 'system_auto' : actorContext?.source,
        sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
        roomNumber: room.roomNumber,
        roomName: room.name,
        displayName: roomDisplayName,
        failedDevices,
        error: '部分设备恢复供电失败',
      },
      false,
    );
    throw new AppError(
      502,
      'ROOM_RESTORE_FAILED',
      `以下设备恢复供电失败：${failedDevices.join(', ')}`,
    );
  }

  const updatedRoom = await prisma.room.update({
    where: { id: roomId },
    data: { cutoff: false },
    include: { energyLimit: true, devices: true },
  });

  const realtime = await computeRoomRealtime(updatedRoom);
  await prisma.room.update({
    where: { id: roomId },
    data: { status: realtime.status },
  });

  await writeOperation(
    operatorUserId,
    OperationType.restore_power,
    roomId,
    {
      action: auto ? 'auto_restore' : 'manual_restore',
      actionLabel: auto ? '自动恢复供电' : '手动恢复供电',
      source: auto ? 'system_auto' : actorContext?.source,
      sourceLabel: auto ? '系统自动' : actorContext?.sourceLabel,
      roomNumber: room.roomNumber,
      roomName: room.name,
      displayName: roomDisplayName,
      note: '执行成功',
    },
    true,
  );

  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );
  const today = getBusinessDate(new Date(), businessTimeZone);
  const tomorrow = addDays(today, 1);

  await prisma.alarmLog.updateMany({
    where: {
      roomId,
      resolved: false,
      type: { in: [AlarmType.limit_80, AlarmType.limit_90, AlarmType.limit_95, AlarmType.limit_reached] },
      createdAt: { gte: today, lt: tomorrow },
    },
    data: {
      resolved: true,
      resolvedAt: new Date(),
    },
  });

  return { ...updatedRoom, status: realtime.status };
}

export async function getMonthlyRanking(limit: number = 14): Promise<RankingItem[]> {
  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );
  const today = getBusinessDate(new Date(), businessTimeZone);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const monthRecords = await prisma.monthlyEnergy.findMany({
    where: { year, month },
    include: {
      room: {
        include: {
          devices: {
            select: { name: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { usageKwh: 'desc' },
    take: limit,
  });

  const roomRecords: RankingItem[] = monthRecords.map((r, i) => ({
    roomId: r.roomId,
    roomNumber: r.room.roomNumber,
    displayName: r.room.devices[0]?.name?.trim() || r.room.name?.trim() || r.room.roomNumber,
    usage: r.usageKwh,
    rank: i + 1,
  }));

  if (roomRecords.length < limit) {
    const existingIds = new Set(roomRecords.map(r => r.roomId));
    const otherRooms = await prisma.room.findMany({
      where: { id: { notIn: Array.from(existingIds) } },
      include: {
        devices: {
          select: { name: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      take: limit - roomRecords.length,
    });
    let nextRank = roomRecords.length + 1;
    for (const r of otherRooms) {
      roomRecords.push({
        roomId: r.id,
        roomNumber: r.roomNumber,
        displayName: r.devices[0]?.name?.trim() || r.name?.trim() || r.roomNumber,
        usage: 0,
        rank: nextRank++,
      });
    }
  }

  return roomRecords;
}
