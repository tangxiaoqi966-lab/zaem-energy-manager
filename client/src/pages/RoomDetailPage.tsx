import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw, ListTree, Power, Pencil } from 'lucide-react';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { RoomEnergyDetail } from '@/types';
import { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RealtimePanel } from '@/components/room/RealtimePanel';
import { Today24hChart } from '@/components/room/charts/Today24hChart';
import { Last7DaysChart } from '@/components/room/charts/Last7DaysChart';
import { Last30DaysChart } from '@/components/room/charts/Last30DaysChart';
import { Last12MonthsChart } from '@/components/room/charts/Last12MonthsChart';
import { DevicesTable } from '@/components/device/DevicesTable';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

export function RoomDetailPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const canControl = role === UserRole.ADMIN || role === UserRole.BOSS;
  const canRename = canControl;
  const [cutoffOpen, setCutoffOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.energy.getRoom(roomId!),
    enabled: !!roomId,
    refetchOnWindowFocus: false,
    refetchInterval: 10000,
  });

  const { data: settings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.system.getSettings(),
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (!roomId) return;

    const socket = getSocket();

    const handler = (d: RoomEnergyDetail) => {
      queryClient.setQueryData(['room', roomId], d);
    };

    socket.on(`room:${roomId}`, handler);

    return () => {
      socket.off(`room:${roomId}`, handler);
    };
  }, [roomId, queryClient]);

  useEffect(() => {
    if (error) {
      toast.error('加载房间数据失败');
    }
  }, [error]);

  const displayName = useMemo(() => {
    if (!data) return '';
    return data.realtime.displayName || data.devices?.[0]?.name?.trim() || data.realtime.roomNumber;
  }, [data]);

  const onCutoff = async () => {
    if (!roomId) return;
    try {
      setActionLoading(true);
      await api.energy.cutoff(roomId);
      toast.success('已执行断电');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['room', roomId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setCutoffOpen(false);
    } catch (e) {
      toast.error('断电操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const onRestore = async () => {
    if (!roomId) return;
    try {
      setActionLoading(true);
      await api.energy.restore(roomId);
      toast.success('已恢复供电');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['room', roomId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    } catch (e) {
      toast.error('恢复供电操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('数据已刷新');
    } catch {
      toast.error('刷新失败');
    }
  };

  const invalidateRoom = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['room', roomId] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };

  const handleStartRename = () => {
    setDraftName(displayName);
    setEditingName(true);
  };

  const handleCancelRename = () => {
    setDraftName(displayName);
    setEditingName(false);
  };

  const handleSaveRename = async () => {
    const primaryDevice = data?.devices?.[0];
    const nextName = draftName.trim();

    if (!primaryDevice?.did || !nextName) {
      toast.error('名称不能为空');
      return;
    }

    try {
      setSavingName(true);
      await api.system.renameDevice(primaryDevice.did, nextName);
      await invalidateRoom();
      setEditingName(false);
      toast.success('名称已更新');
    } catch {
      toast.error('修改名称失败');
    } finally {
      setSavingName(false);
    }
  };

  const handleTogglePower = async () => {
    if (!data || !canControl || actionLoading) return;
    if (data.realtime.cutoff) {
      await onRestore();
      return;
    }
    setCutoffOpen(true);
  };

  if (isLoading || !data) {
    return (
      <div className="p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <span className="text-lg font-medium">房间</span>
          </div>
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="h-40 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <CardTitle className="h-5 w-32 animate-pulse bg-muted rounded" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] animate-pulse bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            {editingName ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-base font-semibold sm:text-lg">房间</span>
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="h-8 w-[180px] sm:w-[220px]"
                  placeholder="输入名称"
                  disabled={savingName}
                />
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={handleSaveRename}
                  disabled={savingName}
                >
                  {savingName ? '保存中...' : '保存'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={handleCancelRename}
                  disabled={savingName}
                >
                  取消
                </Button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-base font-semibold sm:text-lg">房间</span>
                <span className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
                  {displayName}
                </span>
                {canRename && data.devices?.[0]?.did && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleStartRename}
                    title="修改名称"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            <Dialog open={cutoffOpen} onOpenChange={setCutoffOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>确认执行断电操作</DialogTitle>
                  <DialogDescription>
                    此操作将切断房间 {displayName} 的电源，设备将无法使用。确定要继续吗？
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setCutoffOpen(false)}
                    disabled={actionLoading}
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={onCutoff}
                    disabled={actionLoading}
                  >
                    {actionLoading ? '执行中...' : '确认断电'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="h-9 w-9"
              title="刷新详情"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {canControl && (
              <Button
                size="icon"
                className={cn(
                  'h-11 w-11 rounded-full border shadow-sm',
                  data.realtime.cutoff
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-green-500 text-white hover:bg-green-600',
                )}
                onClick={handleTogglePower}
                disabled={actionLoading}
                title={data.realtime.cutoff ? '恢复供电' : '关闭电源'}
              >
                <Power className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <RealtimePanel
          realtime={data.realtime}
          pricePerKwh={settings?.pricePerKwh ?? 0.6}
        />

        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ListTree className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold sm:text-lg">房间设备列表</h2>
            <span className="text-sm text-muted-foreground">
              共 {data.devices?.length ?? 0} 台
            </span>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">本房间接入的智能设备</CardTitle>
              <CardDescription>点击右侧按钮可单设备断电或恢复</CardDescription>
            </CardHeader>
            <CardContent>
              <DevicesTable
                devices={data.devices ?? []}
                invalidateOnChange={invalidateRoom}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>今日24小时曲线</CardTitle>
            </CardHeader>
            <CardContent>
              <Today24hChart data={data.today24h} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近7天柱状</CardTitle>
              <CardDescription>只显示完整天数据，不包含今天</CardDescription>
            </CardHeader>
            <CardContent>
              <Last7DaysChart data={data.last7Days} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近30天趋势</CardTitle>
              <CardDescription>只显示完整天数据，不包含今天</CardDescription>
            </CardHeader>
            <CardContent>
              <Last30DaysChart data={data.last30Days} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近12个月累计</CardTitle>
            </CardHeader>
            <CardContent>
              <Last12MonthsChart data={data.last12Months} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
