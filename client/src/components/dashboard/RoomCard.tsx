import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Pencil } from 'lucide-react';
import { ROOM_STATUS_COLORS, ROOM_STATUS_TEXT, RoomStatus, UserRole } from '../../types';
import { cn } from '../../lib/utils';
import { energy, system } from '../../lib/api';
import { Switch } from '../ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { useAuthStore } from '../../store/auth';
import type { DashboardSpaceCard } from './RoomsGrid';
import { ValueWithUnit } from '../ui/value-with-unit';
import { FeeHint } from '../ui/fee-hint';

interface RoomCardProps {
  room: DashboardSpaceCard;
  pricePerKwh: number;
}

const powerFormatter = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const numberFormatter2 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPower(value: number) {
  return (
    <ValueWithUnit
      value={powerFormatter.format(value)}
      unit="W"
      valueClassName="font-semibold"
    />
  );
}

function formatEnergy(value: number) {
  return (
    <ValueWithUnit
      value={numberFormatter2.format(value)}
      unit="kWh"
      valueClassName="font-semibold"
    />
  );
}

function formatCost(value: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function RoomCard({ room, pricePerKwh }: RoomCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const canControl = role === UserRole.ADMIN || role === UserRole.BOSS;
  const canRename = role === UserRole.ADMIN || role === UserRole.BOSS;
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(room.title);
  const [savingName, setSavingName] = useState(false);
  const [switchPending, setSwitchPending] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitEnabled, setLimitEnabled] = useState(room.limitEnabled);
  const [limitValue, setLimitValue] = useState(
    room.dailyLimit != null && room.dailyLimit > 0 ? String(room.dailyLimit) : '10',
  );
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitTogglePending, setLimitTogglePending] = useState(false);
  const statusColor = ROOM_STATUS_COLORS[room.status];
  const statusText = ROOM_STATUS_TEXT[room.status];
  const percent =
    room.dailyLimit && room.dailyLimit > 0
      ? Math.min(100, (room.todayUsage / room.dailyLimit) * 100)
      : 0;
  const referenceCostBase = room.roomId ? room.todayUsage : room.monthUsage;
  const referenceCost = referenceCostBase * pricePerKwh;

  const getCardToneClass = () => {
    switch (room.status) {
      case RoomStatus.WARNING_80:
      case RoomStatus.WARNING_90:
        return 'border-yellow-300 bg-yellow-50/90 hover:bg-yellow-100/90 dark:border-yellow-700 dark:bg-yellow-950/25 dark:hover:bg-yellow-950/35';
      case RoomStatus.WARNING_95:
      case RoomStatus.CUTOFF:
        return 'border-red-300 bg-red-50/90 hover:bg-red-100/90 dark:border-red-800 dark:bg-red-950/25 dark:hover:bg-red-950/35';
      case RoomStatus.OFFLINE:
        return 'border-slate-300 bg-slate-50/90 hover:bg-slate-100/90 dark:border-slate-700 dark:bg-slate-950/25 dark:hover:bg-slate-950/35';
      case RoomStatus.NORMAL:
      default:
        return 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 dark:border-emerald-900 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25';
    }
  };

  const getProgressColor = () => {
    if (percent >= 95) return 'bg-red-500';
    if (percent >= 90) return 'bg-orange-500';
    if (percent >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleOpenDetail = () => {
    if (editingName) return;
    if (room.roomId) {
      navigate(`/rooms/${room.roomId}`);
    }
  };

  const deviceDid = room.devices[0]?.did;
  const devicePower = room.devices[0]?.power ?? false;

  const handleStartRename = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftName(room.title);
    setEditingName(true);
  };

  const handleCancelRename = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftName(room.title);
    setEditingName(false);
  };

  const handleSaveRename = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const nextName = draftName.trim();
    if (!deviceDid || !nextName) {
      toast.error('名称不能为空');
      return;
    }

    try {
      setSavingName(true);
      await system.renameDevice(deviceDid, nextName);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingName(false);
      toast.success('空间名称已更新');
    } catch {
      toast.error('修改空间名称失败');
    } finally {
      setSavingName(false);
    }
  };

  const handlePowerAction = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!room.roomId || !canControl) return;
    try {
      if (room.cutoff) {
        await energy.restore(room.roomId);
        toast.success('已恢复供电');
      } else {
        await energy.cutoff(room.roomId);
        toast.success('已执行断电');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['room', room.roomId] }),
      ]);
    } catch {
      toast.error(room.cutoff ? '恢复供电失败' : '断电操作失败');
    }
  };

  const handleDeviceSwitch = async (checked: boolean) => {
    if (!deviceDid || !canControl) return;

    try {
      setSwitchPending(true);
      await system.controlDevice(deviceDid, checked ? 'on' : 'off');
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(checked ? '已开启设备' : '已关闭设备');
    } catch {
      toast.error(checked ? '开启设备失败' : '关闭设备失败');
    } finally {
      setSwitchPending(false);
    }
  };

  const handleLimitDialogChange = (open: boolean) => {
    setLimitDialogOpen(open);
    if (open) {
      setLimitEnabled(room.limitEnabled);
      setLimitValue(room.dailyLimit != null && room.dailyLimit > 0 ? String(room.dailyLimit) : '10');
    }
  };

  const handleSaveLimit = async () => {
    if (!room.roomId || !canControl) return;

    const nextLimit = Number(limitValue);
    if (!Number.isFinite(nextLimit) || nextLimit < 0) {
      toast.error('限额值不正确');
      return;
    }

    try {
      setSavingLimit(true);
      await energy.updateLimit(room.roomId, nextLimit, limitEnabled);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['room', room.roomId] }),
      ]);
      setLimitDialogOpen(false);
      toast.success('日限额已更新');
    } catch {
      toast.error('保存限额失败');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleLimitToggle = async (checked: boolean) => {
    if (!room.roomId || !canControl) return;

    const nextLimit =
      Number(limitValue) > 0
        ? Number(limitValue)
        : room.dailyLimit && room.dailyLimit > 0
          ? room.dailyLimit
          : 10;

    if (!Number.isFinite(nextLimit) || nextLimit < 0) {
      toast.error('限额值不正确');
      return;
    }

    try {
      setLimitTogglePending(true);
      await energy.updateLimit(room.roomId, nextLimit, checked);
      setLimitEnabled(checked);
      if (checked) {
        setLimitValue(String(nextLimit));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['room', room.roomId] }),
      ]);
      toast.success(checked ? '已开启限额断电' : '已关闭限额断电');
    } catch {
      toast.error(checked ? '开启限额断电失败' : '关闭限额断电失败');
    } finally {
      setLimitTogglePending(false);
    }
  };

  return (
    <Card
      className={cn(
        'h-full w-full min-w-0 border border-l-4 transition-all duration-200 hover:shadow-lg',
        getCardToneClass(),
        room.roomId ? 'cursor-pointer' : 'cursor-default'
      )}
      style={{ borderLeftColor: statusColor }}
      onClick={handleOpenDetail}
    >
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div
                className="flex flex-wrap items-center gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="h-8 max-w-[220px]"
                  placeholder="输入空间名称"
                  disabled={savingName}
                />
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={handleSaveRename}
                  disabled={savingName}
                >
                  保存
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
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-[clamp(1rem,1.4vw,1.125rem)] font-bold tracking-tight">
                  {room.title}
                </h3>
                {canRename && deviceDid && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={handleStartRename}
                    title="修改空间名称"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] px-1.5 py-0"
            style={{
              backgroundColor: `${statusColor}15`,
              color: statusColor,
              borderColor: `${statusColor}40`,
            }}
          >
            {statusText}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[clamp(0.68rem,1vw,0.78rem)]">
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-muted-foreground">实时功率</div>
            <div className="mt-1 break-words text-[clamp(0.74rem,1.2vw,0.95rem)] font-semibold">
              {room.cutoff ? '已断电' : formatPower(room.power)}
            </div>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <div className="text-muted-foreground">累计电量</div>
            <div className="mt-1 break-words text-[clamp(0.74rem,1.2vw,0.95rem)] font-semibold">
              {formatEnergy(room.monthUsage)}
            </div>
          </div>
          <Dialog open={limitDialogOpen} onOpenChange={handleLimitDialogChange}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  'rounded-md bg-muted/40 p-2 text-left transition-colors',
                  canControl && room.roomId ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'
                )}
                disabled={!canControl || !room.roomId}
                onClick={(event) => {
                  if (!canControl || !room.roomId) return;
                  event.stopPropagation();
                }}
              >
                <div className="text-muted-foreground">日限额</div>
                <div className="mt-1 break-words text-[clamp(0.74rem,1.2vw,0.95rem)] font-semibold">
                  {room.dailyLimit != null ? formatEnergy(room.dailyLimit) : '--'}
                </div>
              </button>
            </DialogTrigger>
            <DialogContent onClick={(event) => event.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>{room.title} 日限额设置</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">每日限额（度）</div>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={limitValue}
                    onChange={(event) => setLimitValue(event.target.value)}
                  />
                </div>
                <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                  这里只改当前卡片自己的日限额。下面的“限额断电”开关只控制要不要按这个限额自动断电。
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setLimitDialogOpen(false)}
                  disabled={savingLimit}
                >
                  取消
                </Button>
                <Button onClick={handleSaveLimit} disabled={savingLimit}>
                  {savingLimit ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <FeeHint pricePerKwh={pricePerKwh} stopPropagationOnMobile>
            <div className="cursor-help rounded-md bg-muted/40 p-2">
              <div className="text-muted-foreground">电费参考</div>
              <div className="mt-1 break-words text-[clamp(0.74rem,1.2vw,0.95rem)] font-semibold">
                {formatCost(referenceCost)}
              </div>
            </div>
          </FeeHint>
        </div>

        <div>
          <div className="mb-1.5 flex flex-col gap-1 text-[clamp(0.72rem,1vw,0.78rem)] sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">今日用电 / 日限额</span>
            <span className="break-words font-medium">
              {formatEnergy(room.todayUsage)} / {room.dailyLimit != null ? formatEnergy(room.dailyLimit) : '--'}
            </span>
          </div>
          <Progress
            value={percent}
            indicatorClassName={getProgressColor()}
            className="h-1.5"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={room.deviceOnline ? 'success' : 'destructive'} className="text-[10px]">
            {room.deviceOnline ? '设备在线' : '设备离线'}
          </Badge>
        </div>

        <div className="flex flex-col gap-3">
          <div className="inline-flex flex-wrap items-center gap-3">
            <span className="text-[clamp(0.8rem,1.1vw,0.95rem)] font-medium">
              {devicePower ? '已开启' : '已关闭'}
            </span>
            <Switch
              checked={devicePower}
              onCheckedChange={handleDeviceSwitch}
              disabled={!deviceDid || !canControl || switchPending || !room.deviceOnline}
              className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
              onClick={(event) => event.stopPropagation()}
            />
            <span className="text-[clamp(0.8rem,1.1vw,0.95rem)] font-medium">
              限额断电
            </span>
            <Switch
              checked={room.limitEnabled}
              onCheckedChange={handleLimitToggle}
              disabled={!room.roomId || !canControl || savingLimit || limitTogglePending}
              className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
          {room.roomId && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 min-w-0 flex-1 basis-[120px] text-[clamp(0.72rem,0.95vw,0.78rem)]"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenDetail();
              }}
            >
              查看详情
            </Button>
          )}
          {room.roomId && canControl && (
            <Button
              size="sm"
              variant={room.cutoff ? 'default' : 'outline'}
              className="h-9 min-w-0 flex-1 basis-[120px] text-[clamp(0.72rem,0.95vw,0.78rem)]"
              onClick={handlePowerAction}
            >
              {room.cutoff ? '恢复供电' : '立即断电'}
            </Button>
          )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RoomCard;
