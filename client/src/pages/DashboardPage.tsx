import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, BarChart3, Power, RefreshCw, ShieldAlert, BellRing, ZapOff, X } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { RoomStatus, UserRole, AlarmLevel } from '@/types';
import type { DashboardSummary, AlarmLogResponse } from '@/types';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { RoomsGrid, type DashboardSpaceCard } from '@/components/dashboard/RoomsGrid';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function getRoomSortValue(roomNumber?: string | null): number {
  const parsed = Number.parseInt(roomNumber ?? '', 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function DashboardPage() {
  const DASHBOARD_ALARM_DISPLAY_MS = 12000;
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const canControl = role === UserRole.ADMIN || role === UserRole.BOSS;
  const [refreshing, setRefreshing] = useState(false);
  const [powerPending, setPowerPending] = useState(false);
  const [limitPending, setLimitPending] = useState(false);
  const [confirmPowerOffOpen, setConfirmPowerOffOpen] = useState(false);
  const [confirmLimitOffOpen, setConfirmLimitOffOpen] = useState(false);
  const [showLatestAlarm, setShowLatestAlarm] = useState(false);
  const [dismissedLatestAlarmId, setDismissedLatestAlarmId] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard.get(),
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 1000 * 30,
  });

  const { data: settings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.system.getSettings(),
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60,
  });
  const { data: unresolvedAlarms } = useQuery<{
    items: AlarmLogResponse[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ['dashboard-unresolved-alarms'],
    queryFn: () => api.logs.alarms({ page: 1, pageSize: 1, resolved: false }),
    refetchOnWindowFocus: false,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 1000 * 10,
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: DashboardSummary) => {
      queryClient.setQueryData(['dashboard'], data);
    };
    socket.on('dashboard', handler);
    return () => {
      socket.off('dashboard', handler);
    };
  }, [queryClient]);

  const isLoading = summaryLoading || !summary;

  const displayCards = useMemo<DashboardSpaceCard[]>(() => {
    if (!summary) return [];
    const roomData = Array.isArray(summary.roomData) ? summary.roomData : [];
    const devices = Array.isArray(summary.devices) ? summary.devices : [];
    const roomCards = roomData
      .filter((room) => room.devices.length > 0)
      .map((room, index) => {
        const mainDevice = room.devices[0];
        return {
          key: room.roomId,
          title: room.roomNumber || `空间 ${index + 1}`,
          subtitle: room.roomAnnotation || '',
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          roomAnnotation: room.roomAnnotation ?? null,
          status: room.status,
          power: room.power ?? mainDevice?.powerW ?? 0,
          todayUsage: room.todayUsage,
          monthUsage: mainDevice?.totalKwh ?? room.monthUsage ?? 0,
          usagePercent: room.usagePercent,
          dailyLimit: room.dailyLimit,
          limitEnabled: room.limitEnabled,
          cutoff: room.cutoff,
          deviceOnline: room.deviceOnline,
            powerActionCooldownUntil: room.powerActionCooldownUntil,
            powerActionRetryAfterSeconds: room.powerActionRetryAfterSeconds,
            powerActionLastType: room.powerActionLastType,
          devices: room.devices,
          mapped: true,
        } satisfies DashboardSpaceCard;
      })
      .sort((a, b) => {
        const roomDiff = getRoomSortValue(a.roomNumber) - getRoomSortValue(b.roomNumber);
        if (roomDiff !== 0) {
          return roomDiff;
        }
        return (a.roomNumber || a.key).localeCompare(b.roomNumber || b.key, 'en');
      });

    const roomDidSet = new Set(
      roomCards.flatMap((room) => room.devices.map((device) => device.did)),
    );

    const deviceFallbackCards = devices
      .filter((device) => !roomDidSet.has(device.did))
      .map((device, index) => ({
        key: device.did,
        title: device.roomNumber || device.name || `空间 ${index + 1}`,
        subtitle: device.model || `DID: ${device.did.slice(-6)}`,
        roomId: device.roomId,
        roomNumber: device.roomNumber,
        roomAnnotation: null,
        status: device.status === 'offline' ? RoomStatus.OFFLINE : RoomStatus.NORMAL,
        power: device.powerW ?? 0,
        todayUsage: 0,
        monthUsage: device.totalKwh ?? 0,
        usagePercent: 0,
        dailyLimit: null,
        limitEnabled: false,
        cutoff: false,
        deviceOnline: device.status === 'online',
          powerActionCooldownUntil: null,
          powerActionRetryAfterSeconds: 0,
          powerActionLastType: null,
        devices: [device],
        mapped: true,
      }))
      .sort((a, b) => {
        const roomDiff = getRoomSortValue(a.roomNumber) - getRoomSortValue(b.roomNumber);
        if (roomDiff !== 0) {
          return roomDiff;
        }
        return (a.roomNumber || a.title || a.key).localeCompare(
          b.roomNumber || b.title || b.key,
          'en',
        );
      });

    return [...roomCards, ...deviceFallbackCards];
  }, [summary]);
  const pricePerKwh = settings?.pricePerKwh ?? 0.6;
  const allDevicesPoweredOn = useMemo(() => {
    if (!Array.isArray(summary?.devices) || !summary.devices.length) return false;
    return summary.devices.every((device) => device.power === true);
  }, [summary]);
  const allLimitsEnabled = useMemo(() => {
    const rooms = Array.isArray(summary?.roomData)
      ? summary.roomData.filter((room) => room.devices.length > 0)
      : [];
    if (!rooms.length) return false;
    return rooms.every((room) => room.limitEnabled);
  }, [summary]);
  const latestAlarm = unresolvedAlarms?.items?.[0];
  const unresolvedAlarmCount = Number(unresolvedAlarms?.total ?? 0);
  const cutoffRooms = useMemo(
    () =>
      (summary?.roomData ?? [])
        .filter((room) => room.cutoff)
        .sort((a, b) => getRoomSortValue(a.roomNumber) - getRoomSortValue(b.roomNumber))
        .map((room) => room.displayName || room.roomNumber)
        .filter(Boolean),
    [summary],
  );
  const latestAlarmBadgeVariant =
    latestAlarm?.level === AlarmLevel.CRITICAL || latestAlarm?.level === AlarmLevel.DANGER
      ? 'destructive'
      : 'default';
  const showLatestAlarmBanner =
    showLatestAlarm && !!latestAlarm && latestAlarm.id !== dismissedLatestAlarmId;

  useEffect(() => {
    if (!latestAlarm?.id) {
      setShowLatestAlarm(false);
      setDismissedLatestAlarmId(null);
      return;
    }

    setShowLatestAlarm(true);
    const timer = window.setTimeout(() => {
      setShowLatestAlarm(false);
    }, DASHBOARD_ALARM_DISPLAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [latestAlarm?.id]);

  const refreshDashboard = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleAllPower = async (nextAction: 'on' | 'off') => {
    try {
      setPowerPending(true);
      await api.system.controlAllDevices(nextAction);
      await refreshDashboard();
      toast.success(nextAction === 'on' ? '已开启全部设备电源' : '已关闭全部设备电源');
    } catch {
      toast.error(nextAction === 'on' ? '开启全部设备失败' : '关闭全部设备失败');
    } finally {
      setPowerPending(false);
      setConfirmPowerOffOpen(false);
    }
  };

  const handleToggleAllLimits = async (enabled: boolean) => {
    try {
      setLimitPending(true);
      await api.energy.bulkToggleLimits(enabled);
      await refreshDashboard();
      toast.success(enabled ? '已开启全部限额断电' : '已关闭全部限额断电');
    } catch {
      toast.error(enabled ? '开启全部限额断电失败' : '关闭全部限额断电失败');
    } finally {
      setLimitPending(false);
      setConfirmLimitOffOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">仪表盘</h1>
          </div>
        </div>
        <div className="hidden min-w-0 justify-center xl:flex">
          {showLatestAlarmBanner && latestAlarm ? (
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-red-200 bg-red-50/90 px-3 py-1.5 text-xs text-red-800 shadow-sm">
              <BellRing className="h-4 w-4 shrink-0 text-red-600" />
              <Badge variant={latestAlarmBadgeVariant} className="shrink-0 text-[10px]">
                {unresolvedAlarmCount > 1 ? `${unresolvedAlarmCount} 条` : '1 条'}
              </Badge>
              <span className="truncate">
                {(latestAlarm.displayName ?? latestAlarm.roomNumber ?? '未知房间') + '：' + latestAlarm.message}
              </span>
              <button
                type="button"
                className="shrink-0 text-red-700 transition hover:text-red-900"
                title="关闭报警提示"
                onClick={() => {
                  setDismissedLatestAlarmId(latestAlarm.id);
                  setShowLatestAlarm(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 self-end xl:self-auto">
          {cutoffRooms.length > 0 ? (
            <div className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs text-amber-800 shadow-sm">
              <ZapOff className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="truncate">限额超出已停供 {cutoffRooms.length} 个</span>
            </div>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-full"
            onClick={refreshDashboard}
            disabled={refreshing || powerPending || limitPending}
            title="刷新数据"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {canControl && (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={`h-11 w-11 rounded-full ${allDevicesPoweredOn ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}
                onClick={() => {
                  if (allDevicesPoweredOn) {
                    setConfirmPowerOffOpen(true);
                    return;
                  }
                  handleToggleAllPower('on');
                }}
                disabled={refreshing || powerPending || limitPending || !summary?.devices?.length}
                title={allDevicesPoweredOn ? '关闭全部设备电源' : '开启全部设备电源'}
              >
                <Power className={`h-5 w-5 ${powerPending ? 'animate-pulse' : ''}`} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={`h-11 w-11 rounded-full ${allLimitsEnabled ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}
                onClick={() => {
                  if (allLimitsEnabled) {
                    setConfirmLimitOffOpen(true);
                    return;
                  }
                  handleToggleAllLimits(true);
                }}
                disabled={refreshing || powerPending || limitPending || !(summary?.roomData?.length)}
                title={allLimitsEnabled ? '关闭全部限额断电' : '开启全部限额断电'}
              >
                <ShieldAlert className={`h-5 w-5 ${limitPending ? 'animate-pulse' : ''}`} />
              </Button>
            </>
          )}
        </div>
        {showLatestAlarmBanner && latestAlarm ? (
          <div className="flex justify-center xl:hidden">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-red-200 bg-red-50/90 px-3 py-1.5 text-xs text-red-800 shadow-sm">
              <BellRing className="h-4 w-4 shrink-0 text-red-600" />
              <Badge variant={latestAlarmBadgeVariant} className="shrink-0 text-[10px]">
                {unresolvedAlarmCount > 1 ? `${unresolvedAlarmCount} 条` : '1 条'}
              </Badge>
              <span className="truncate">
                {(latestAlarm.displayName ?? latestAlarm.roomNumber ?? '未知房间') + '：' + latestAlarm.message}
              </span>
              <button
                type="button"
                className="shrink-0 text-red-700 transition hover:text-red-900"
                title="关闭报警提示"
                onClick={() => {
                  setDismissedLatestAlarmId(latestAlarm.id);
                  setShowLatestAlarm(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <StatsCards summary={summary} pricePerKwh={pricePerKwh} />
      )}

      <Separator />

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold sm:text-lg">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            空间状态总览
            <span className="text-sm font-normal text-muted-foreground">
              （已识别 {displayCards.length} 个）
            </span>
          </h2>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-52 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <RoomsGrid rooms={displayCards} pricePerKwh={pricePerKwh} />
        )}
      </div>

      <Dialog open={confirmPowerOffOpen} onOpenChange={setConfirmPowerOffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认关闭全部设备电源？</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            这会对当前已识别的所有设备执行统一断电。
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPowerOffOpen(false)} disabled={powerPending}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => handleToggleAllPower('off')} disabled={powerPending}>
              {powerPending ? '执行中...' : '确认关闭'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLimitOffOpen} onOpenChange={setConfirmLimitOffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认关闭全部限额断电？</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            关闭后不会再按各自日限额自动断电，但每个空间的限额数值会保留。
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLimitOffOpen(false)} disabled={limitPending}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => handleToggleAllLimits(false)} disabled={limitPending}>
              {limitPending ? '执行中...' : '确认关闭'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
