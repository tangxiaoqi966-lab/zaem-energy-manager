import prisma from '../../lib/prisma';
import { computeRoomRealtime } from '../energy/energy.service';
import { systemService } from '../system/system.service';
import { xiaomiAdapter } from '../system/xiaomi.adapter';
import { DashboardSummary, DeviceItem, DeviceStatus } from '@shared/index';
import { DeviceStatus as PrismaDeviceStatus } from '@prisma/client';
import { DEFAULT_BUSINESS_TIMEZONE, getBusinessDate } from '../../lib/business-time';

const PRISMA_TO_SHARED_DEVICE_STATUS: Record<PrismaDeviceStatus, DeviceStatus> =
  {
    online: DeviceStatus.ONLINE,
    offline: DeviceStatus.OFFLINE,
    unknown: DeviceStatus.UNKNOWN,
  };

function toDeviceItem(d: any): DeviceItem {
  const prismaStatus = (d.status ?? 'unknown') as PrismaDeviceStatus;
  const sharedStatus =
    PRISMA_TO_SHARED_DEVICE_STATUS[prismaStatus] ?? DeviceStatus.UNKNOWN;
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

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await xiaomiAdapter.ensureRealtimeFresh();
  await xiaomiAdapter.ensureDailyHistoryFresh();

  const businessTimeZone = await systemService.getSetting(
    'businessTimezone',
    DEFAULT_BUSINESS_TIMEZONE,
  );
  const today = getBusinessDate(new Date(), businessTimeZone);

  const pricePerKwh = await systemService.getSetting('pricePerKwh', 0.6);

  const [todayUsageRecords, totalDevices, onlineDevices, offlineDevices, alarmCount, rooms, rawDevices] = await Promise.all([
    prisma.dailyEnergy.findMany({
      where: { date: today },
    }),
    prisma.device.count(),
    prisma.device.count({ where: { status: PrismaDeviceStatus.online } }),
    prisma.device.count({ where: { status: PrismaDeviceStatus.offline } }),
    prisma.alarmLog.count({ where: { resolved: false } }),
    prisma.room.findMany({ include: { energyLimit: true, devices: true } }),
    prisma.device.findMany({
      include: { room: { select: { roomNumber: true } } },
      orderBy: [{ roomId: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const todayTotalUsage = todayUsageRecords.reduce((sum, r) => sum + r.usageKwh, 0);
  const estimatedCost = todayTotalUsage * pricePerKwh;

  const [roomData, devices] = await Promise.all([
    Promise.all(rooms.map(r => computeRoomRealtime(r, businessTimeZone))),
    Promise.resolve(rawDevices.map(toDeviceItem)),
  ]);

  return {
    todayTotalUsage,
    estimatedCost,
    totalDevices,
    onlineDevices,
    offlineDevices,
    alarmCount,
    roomData,
    devices,
  };
}
