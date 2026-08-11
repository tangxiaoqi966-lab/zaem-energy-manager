import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, BarChart3, Power, RefreshCw, ShieldAlert, BellRing } from 'lucide-react';
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

export function DashboardPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const canControl = role === UserRole.ADMIN || role === UserRole.BOSS;
  const [refreshing, setRefreshing] = useState(false);
  const [powerPending, setPowerPending] = useState(false);
  const [limitPending, setLimitPending] = useState(false);
  const [confirmPowerOffOpen, setConfirmPowerOffOpen] = useState(false);
  const [confirmLimitOffOpen, setConfirmLimitOffOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard.get(),
    refetchOnWindowFocus: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 1000 * 10,
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
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 3000,
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
          key: mainDevice?.did ?? room.roomId,
          title: room.displayName || mainDevice?.name || `空间 ${index + 1}`,
          subtitle: mainDevice?.model || `DID: ${mainDevice?.did?.slice(-6) ?? room.roomId.slice(-6)}`,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          status: room.status,
          power: room.power ?? mainDevice?.powerW ?? 0,
          todayUsage: room.todayUsage,
          monthUsage: mainDevice?.totalKwh ?? room.monthUsage ?? 0,
          usagePercent: room.usagePercent,
          dailyLimit: room.dailyLimit,
          limitEnabled: room.limitEnabled,
          cutoff: room.cutoff,
          deviceOnline: room.deviceOnline,
          devices: room.devices,
          mapped: true,
        } satisfies DashboardSpaceCard;
      });

    const roomDidSet = new Set(
      roomCards.flatMap((room) => room.devices.map((device) => device.did)),
    );

    const deviceFallbackCards = devices
      .filter((device) => !roomDidSet.has(device.did))
      .map((device, index) => ({
        key: device.did,
        title: device.name || `空间 ${index + 1}`,
        subtitle: device.model || `DID: ${device.did.slice(-6)}`,
        roomId: device.roomId,
        roomNumber: device.roomNumber,
        status: device.status === 'offline' ? RoomStatus.OFFLINE : RoomStatus.NORMAL,
        power: device.powerW ?? 0,
        todayUsage: 0,
        monthUsage: device.totalKwh ?? 0,
        usagePercent: 0,
        dailyLimit: null,
        limitEnabled: false,
        cutoff: false,
        deviceOnline: device.status === 'online',
        devices: [device],
        mapped: true,
      }));

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
  const latestAlarmBadgeVariant =
    latestAlarm?.level === AlarmLevel.CRITICAL || latestAlarm?.level === AlarmLevel.DANGER
      ? 'destructive'
      : 'default';

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">仪表盘</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      {latestAlarm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <BellRing className="h-4 w-4 shrink-0" />
          <Badge variant={latestAlarmBadgeVariant} className="shrink-0">
            {unresolvedAlarmCount > 1 ? `最新报警 · 共 ${unresolvedAlarmCount} 条` : '最新报警'}
          </Badge>
          <span className="min-w-0 flex-1 truncate">
            {latestAlarm.displayName ?? latestAlarm.roomNumber ?? '未知房间'}：{latestAlarm.message}
          </span>
        </div>
      ) : null}

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
