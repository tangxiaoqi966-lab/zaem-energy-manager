import cron from 'node-cron';
import prisma from './prisma';
import { xiaomiAdapter } from '../modules/system/xiaomi.adapter';
import { systemService } from '../modules/system/system.service';
import {
  restorePower,
  cutoffPower,
  checkAndTriggerAlarms,
  computeRoomRealtime,
} from '../modules/energy/energy.service';
import { broadcastDashboard } from './socket';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  addDays,
  getBusinessDate,
  getBusinessHour,
  getBusinessMinute,
  getDayKey,
} from './business-time';

let lastDailyResetDayKey = '';

async function dailyResetTask(): Promise<boolean> {
  const autoRestorePower = await systemService.getSetting('autoRestorePower', true);
  if (!autoRestorePower) {
    return true;
  }

  const cutoffRooms = await prisma.room.findMany({
    where: { cutoff: true },
  });

  let allSucceeded = true;
  for (const room of cutoffRooms) {
    try {
      await restorePower(room.id, 'SYSTEM_AUTO', true);
    } catch (error: any) {
      allSucceeded = false;
      console.error(
        `[dailyResetTask] 自动恢复供电失败 roomId=${room.id}:`,
        error?.message || error,
      );
    }
  }

  return allSucceeded;
}

async function accumulateRoomEnergy(roomId: string, businessTimeZone: string): Promise<void> {
  try {
    const devices = await prisma.device.findMany({
      where: { roomId, status: 'online' },
    });

    let totalPowerW = 0;
    for (const device of devices) {
      totalPowerW += device.powerW ?? 0;
    }

    const estimatedKwh = (totalPowerW * (1 / 60)) / 1000;

    const now = new Date();
    const today = getBusinessDate(now, businessTimeZone);
    const currentHour = getBusinessHour(now, businessTimeZone);

    const pricePerKwh = await systemService.getSetting('pricePerKwh', 0.6);

    await prisma.dailyEnergy.upsert({
      where: {
        roomId_date: { roomId, date: today },
      },
      update: {
        usageKwh: { increment: estimatedKwh },
        cost: { increment: estimatedKwh * pricePerKwh },
        peakW: {
          set: Math.max(totalPowerW, 0),
        },
      },
      create: {
        roomId,
        date: today,
        usageKwh: estimatedKwh,
        cost: estimatedKwh * pricePerKwh,
        peakW: totalPowerW,
      },
    });

    await prisma.hourlyEnergy.upsert({
      where: {
        roomId_date_hour: { roomId, date: today, hour: currentHour },
      },
      update: {
        usageKwh: { increment: estimatedKwh },
        peakW: {
          set: Math.max(totalPowerW, 0),
        },
      },
      create: {
        roomId,
        date: today,
        hour: currentHour,
        usageKwh: estimatedKwh,
        peakW: totalPowerW,
      },
    });

    if (today.getDate() === 1 && currentHour === 0) {
      await aggregateMonthly(roomId, today);
    }
  } catch {
  }
}

async function aggregateMonthly(roomId: string, businessToday: Date): Promise<void> {
  try {
    const lastMonth = new Date(businessToday.getFullYear(), businessToday.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const dailyRecords = await prisma.dailyEnergy.findMany({
      where: {
        roomId,
        date: { gte: firstDay, lte: lastDay },
      },
    });

    const totalKwh = dailyRecords.reduce((sum, r) => sum + r.usageKwh, 0);
    const totalCost = dailyRecords.reduce((sum, r) => sum + r.cost, 0);

    if (totalKwh > 0 || totalCost > 0) {
      await prisma.monthlyEnergy.upsert({
        where: {
          roomId_year_month: { roomId, year, month },
        },
        update: {
          usageKwh: totalKwh,
          cost: totalCost,
        },
        create: {
          roomId,
          year,
          month,
          usageKwh: totalKwh,
          cost: totalCost,
        },
      });
    }
  } catch {
  }
}

async function syncDataTask(): Promise<void> {
  try {
    await xiaomiAdapter.refreshAllRoomsRealtime();
    const businessTimeZone = await systemService.getSetting(
      'businessTimezone',
      DEFAULT_BUSINESS_TIMEZONE,
    );

    const rooms = await prisma.room.findMany({
      include: { energyLimit: true, devices: true },
    });

    const autoCutoff = await systemService.getSetting('autoCutoff', true);

    for (const room of rooms) {
      try {
        await accumulateRoomEnergy(room.id, businessTimeZone);

        await checkAndTriggerAlarms(room.id);

        if (room.cutoff) {
          const poweredDevices = room.devices.filter(
            (device) =>
              device.status === 'online' &&
              (device.power === true || Number(device.powerW ?? 0) > 0),
          );

          if (poweredDevices.length > 0) {
            try {
              await cutoffPower(room.id, undefined as any, true);
            } catch {
            }
          }
          continue;
        }

        if (autoCutoff) {
          const realtime = await computeRoomRealtime(room);
          if (realtime.limitEnabled && realtime.usagePercent >= 100) {
            try {
              await cutoffPower(room.id, undefined as any, true);
            } catch {
            }
          }
        }
      } catch {
      }
    }

    await broadcastDashboard();
  } catch {
  }
}

export async function startCronJobs(): Promise<void> {
  const minute = 5;

  try {
    cron.schedule('* * * * *', () => {
      (async () => {
        const businessTimeZone = await systemService.getSetting(
          'businessTimezone',
          DEFAULT_BUSINESS_TIMEZONE,
        );
        const dailyResetHour = Number(await systemService.getSetting('dailyResetHour', 0)) || 0;
        const now = new Date();
        const dayKey = getDayKey(now, businessTimeZone);
        const currentHour = getBusinessHour(now, businessTimeZone);
        const currentMinute = getBusinessMinute(now, businessTimeZone);

        if (
          currentHour === dailyResetHour &&
          currentMinute >= minute &&
          lastDailyResetDayKey !== dayKey
        ) {
          const resetOk = await dailyResetTask().catch((error) => {
            console.error('[cron] 执行自动恢复供电失败：', error?.message || error);
            return false;
          });
          if (resetOk) {
            lastDailyResetDayKey = dayKey;
          }
        }

        await syncDataTask().catch(() => {});
      })().catch(() => {});
    });
  } catch {
  }

  // Start one real sync immediately so the detail page does not wait for the next minute tick.
  await syncDataTask().catch(() => {});
}
