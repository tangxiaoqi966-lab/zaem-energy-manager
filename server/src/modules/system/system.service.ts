import { OperationType } from '@prisma/client';
import { SystemSettingsData } from '@shared/index';
import prisma from '../../lib/prisma';
import { writeOperation } from '../../lib/logger';
import { xiaomiAdapter } from './xiaomi.adapter';
import { broadcastDashboard } from '../../lib/socket';
import { DEFAULT_BUSINESS_TIMEZONE, normalizeBusinessTimeZone } from '../../lib/business-time';
import { OperationActorContext } from '../../lib/operation-log';
import { formatRoomDisplayName, normalizeRoomAnnotation } from '../../lib/room-display';

const DEFAULT_SETTINGS: SystemSettingsData = {
  alarmRatio80: 0.8,
  alarmRatio90: 0.9,
  alarmRatio95: 0.95,
  autoCutoff: true,
  autoRestorePower: true,
  businessTimezone: DEFAULT_BUSINESS_TIMEZONE,
  refreshInterval: 30,
  dailyResetHour: 0,
  pricePerKwh: 0.58,
};

type SettingsKey = keyof SystemSettingsData;
const ALARM_RATIO_KEYS: SettingsKey[] = ['alarmRatio80', 'alarmRatio90', 'alarmRatio95'];

function isAlarmRatioKey(key: SettingsKey): boolean {
  return ALARM_RATIO_KEYS.includes(key);
}

function normalizeAlarmRatioValue(value: string | number): number {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numValue)) {
    return 0;
  }

  if (numValue > 1) {
    return numValue / 100;
  }

  return numValue;
}

class SystemService {
  public async getSettings(): Promise<SystemSettingsData> {
    const settings = await prisma.systemSettings.findMany();
    const result: SystemSettingsData = { ...DEFAULT_SETTINGS };

    for (const setting of settings) {
      const key = setting.key as SettingsKey;
      if (key in DEFAULT_SETTINGS) {
        if (key === 'autoCutoff' || key === 'autoRestorePower') {
          result[key] = setting.value === 'true';
        } else if (key === 'businessTimezone') {
          result[key] = normalizeBusinessTimeZone(setting.value);
        } else if (isAlarmRatioKey(key)) {
          (result as unknown as Record<string, number | boolean | string>)[key] =
            normalizeAlarmRatioValue(setting.value);
        } else {
          const numValue = parseFloat(setting.value);
          if (!isNaN(numValue)) {
            (result as unknown as Record<string, number | boolean | string>)[key] = numValue;
          }
        }
      }
    }

    return result;
  }

  public async updateSettings(
    partial: Partial<SystemSettingsData>,
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<SystemSettingsData> {
    const entries = Object.entries(partial) as [SettingsKey, SystemSettingsData[SettingsKey]][];

    for (const [key, value] of entries) {
      const normalizedValue =
        key === 'businessTimezone'
          ? normalizeBusinessTimeZone(String(value))
          : isAlarmRatioKey(key)
            ? normalizeAlarmRatioValue(value as string | number)
          : value;
      const stringValue =
        typeof normalizedValue === 'boolean' ? String(normalizedValue) : String(normalizedValue);
      await prisma.systemSettings.upsert({
        where: { key: key as string },
        update: { value: stringValue },
        create: { key: key as string, value: stringValue },
      });
    }

    await writeOperation(
      operatorUserId,
      OperationType.update_settings,
      null,
      {
        action: 'update_settings',
        actionLabel: '修改系统设置',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        settings: partial as Record<string, unknown>,
      },
      true,
    );

    return this.getSettings();
  }

  public async getSetting<K extends SettingsKey>(
    key: K,
    fallback?: SystemSettingsData[K],
  ): Promise<SystemSettingsData[K]> {
    const setting = await prisma.systemSettings.findUnique({
      where: { key: key as string },
    });

    if (!setting) {
      return fallback !== undefined ? fallback : DEFAULT_SETTINGS[key];
    }

    if (key === 'autoCutoff' || key === 'autoRestorePower') {
      return (setting.value === 'true') as SystemSettingsData[K];
    }

    if (key === 'businessTimezone') {
      return normalizeBusinessTimeZone(setting.value) as SystemSettingsData[K];
    }

    if (isAlarmRatioKey(key)) {
      return normalizeAlarmRatioValue(setting.value) as SystemSettingsData[K];
    }

    const numValue = parseFloat(setting.value);
    if (isNaN(numValue)) {
      return fallback !== undefined ? fallback : DEFAULT_SETTINGS[key];
    }

    return numValue as SystemSettingsData[K];
  }

  public async syncXiaomiDevices(
    operatorUserId: string,
    actorContext?: OperationActorContext,
  ): Promise<boolean> {
    await xiaomiAdapter.syncDevicesToDb(operatorUserId, actorContext);
    return true;
  }

  public async renameDevice(
    did: string,
    name: string,
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<{ did: string; name: string }> {
    const nextName = name.trim();

    if (!did) {
      throw new Error('缺少设备 did');
    }

    if (!nextName) {
      throw new Error('设备名称不能为空');
    }

    const existing = await prisma.device.findUnique({
      where: { did },
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
            name: true,
          },
        },
      },
    });

    if (!existing) {
      throw new Error('设备不存在');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextDevice = await tx.device.update({
        where: { did },
        data: { name: nextName },
        select: { did: true, name: true },
      });

      if (existing.room?.id) {
        await tx.room.update({
          where: { id: existing.room.id },
          data: { name: nextName },
        });
      }

      return nextDevice;
    });

    await writeOperation(
      operatorUserId,
      OperationType.update_settings,
      existing.room?.id ?? null,
      {
        action: 'rename_device',
        actionLabel: '修改空间名称',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        roomNumber: existing.room?.roomNumber ?? null,
        roomName: nextName,
        displayName: nextName,
        did,
        deviceName: nextName,
      },
      true,
    );

    return updated;
  }

  public async updateRoomAnnotation(
    roomId: string,
    annotation: string,
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<{ roomId: string; roomNumber: string; annotation: string | null; displayName: string }> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        roomNumber: true,
        name: true,
      },
    });

    if (!room) {
      throw new Error('房间不存在');
    }

    const normalizedAnnotation = normalizeRoomAnnotation(room.roomNumber, annotation);
    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        name: normalizedAnnotation ?? '',
      },
      select: {
        id: true,
        roomNumber: true,
        name: true,
      },
    });

    await writeOperation(
      operatorUserId,
      OperationType.update_settings,
      roomId,
      {
        action: 'update_room_annotation',
        actionLabel: normalizedAnnotation ? '修改房间备注' : '清空房间备注',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        roomNumber: updated.roomNumber,
        roomName: updated.name,
        displayName: formatRoomDisplayName(updated.roomNumber, updated.name),
        note: normalizedAnnotation ? `房间备注已更新为 ${normalizedAnnotation}` : '房间备注已清空',
      },
      true,
    );

    return {
      roomId: updated.id,
      roomNumber: updated.roomNumber,
      annotation: normalizeRoomAnnotation(updated.roomNumber, updated.name),
      displayName: formatRoomDisplayName(updated.roomNumber, updated.name),
    };
  }

  public async bulkControlDevices(
    action: 'on' | 'off',
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<{ ok: boolean; action: 'on' | 'off'; total: number; success: number; failed: number }> {
    const devices = await prisma.device.findMany({
      select: { did: true },
    });

    let success = 0;
    let failed = 0;

    for (const device of devices) {
      try {
        if (action === 'on') {
          await xiaomiAdapter.turnOn(device.did, operatorUserId, actorContext);
        } else {
          await xiaomiAdapter.turnOff(device.did, operatorUserId, actorContext);
        }
        success += 1;
      } catch {
        failed += 1;
      }
    }

    await xiaomiAdapter.refreshAllRoomsRealtime().catch(() => {});
    await broadcastDashboard().catch(() => {});

    await writeOperation(
      operatorUserId,
      OperationType.control_device,
      null,
      {
        action: 'bulk_device_control',
        actionLabel: action === 'on' ? '批量开启设备电源' : '批量关闭设备电源',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        powerAction: action,
        totalCount: devices.length,
        successCount: success,
        failedCount: failed,
      },
      failed === 0,
    );

    return {
      ok: failed === 0,
      action,
      total: devices.length,
      success,
      failed,
    };
  }
}

export const systemService = new SystemService();
export default SystemService;
