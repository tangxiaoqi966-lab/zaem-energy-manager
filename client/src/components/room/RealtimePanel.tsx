import {
  Activity,
  Zap,
  Battery,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { RealtimeEnergyData } from '@/types';
import { ROOM_STATUS_COLORS, ROOM_STATUS_TEXT, RoomStatus } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ValueWithUnit } from '@/components/ui/value-with-unit';
import { FeeHint } from '@/components/ui/fee-hint';

interface RealtimePanelProps {
  realtime: RealtimeEnergyData;
  pricePerKwh: number;
}

const numberFormatter0 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter1 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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
      valueClassName="font-bold"
    />
  );
}

function formatEnergy(value: number, digits: 0 | 1 | 2 = 2) {
  const formatter =
    digits === 0 ? numberFormatter0 : digits === 1 ? numberFormatter1 : numberFormatter2;
  return (
    <ValueWithUnit
      value={formatter.format(value)}
      unit="kWh"
      valueClassName="font-semibold"
    />
  );
}

function getBadgeVariant(
  status: RoomStatus
): 'default' | 'success' | 'warning' | 'danger' | 'destructive' {
  switch (status) {
    case RoomStatus.NORMAL:
      return 'success';
    case RoomStatus.WARNING_80:
      return 'warning';
    case RoomStatus.WARNING_90:
    case RoomStatus.WARNING_95:
    case RoomStatus.CUTOFF:
      return 'danger';
    default:
      return 'default';
  }
}

function getProgressColor(percent: number): string {
  if (percent >= 95) return 'bg-red-500';
  if (percent >= 90) return 'bg-orange-500';
  if (percent >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
}

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  iconBg: string;
  extra?: ReactNode;
}

function MetricCard({ icon, label, value, iconBg, extra }: MetricCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 items-start gap-3 p-4">
        <div className={cn('rounded-lg p-2.5 shrink-0 self-start sm:p-3', iconBg)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
          <div className="mt-1 break-words text-lg font-bold leading-tight sm:text-2xl">{value}</div>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}

export function RealtimePanel({
  realtime,
  pricePerKwh,
}: RealtimePanelProps) {
  const percent =
    realtime.dailyLimit > 0
      ? Math.min(100, (realtime.todayUsage / realtime.dailyLimit) * 100)
      : 0;
  const cost = new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(realtime.todayUsage * pricePerKwh);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          icon={<Activity className="w-6 h-6 text-blue-600" />}
          iconBg="bg-blue-100"
          label="实时功率"
          value={formatPower(realtime.power)}
        />
        <MetricCard
          icon={<Zap className="w-6 h-6 text-yellow-600" />}
          iconBg="bg-yellow-100"
          label="实时电流"
          value={<ValueWithUnit value={realtime.current.toFixed(2)} unit="A" valueClassName="font-bold" />}
        />
        <MetricCard
          icon={<Battery className="w-6 h-6 text-green-600" />}
          iconBg="bg-green-100"
          label="实时电压"
          value={<ValueWithUnit value={realtime.voltage.toFixed(0)} unit="V" valueClassName="font-bold" />}
        />
        <MetricCard
          icon={
            <AlertCircle
              className="w-6 h-6"
              style={{ color: ROOM_STATUS_COLORS[realtime.status] }}
            />
          }
          iconBg="bg-gray-100"
          label="状态"
          value={ROOM_STATUS_TEXT[realtime.status]}
          extra={
            <Badge
              variant={getBadgeVariant(realtime.status)}
              className="mt-2 inline-flex"
            >
              {realtime.deviceOnline ? '设备在线' : '设备离线'}
            </Badge>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="font-medium">今日用电量</div>
            </div>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <ValueWithUnit
                value={numberFormatter2.format(realtime.todayUsage)}
                unit="kWh"
                className="break-words text-2xl sm:text-3xl"
                valueClassName="font-bold"
              />
              <span className="break-words text-sm text-muted-foreground sm:text-base">
                / {formatEnergy(realtime.dailyLimit)}
              </span>
            </div>
            <Progress
              value={percent}
              indicatorClassName={getProgressColor(percent)}
              className="h-2 mb-2"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {percent.toFixed(1)}%
              </span>
              <FeeHint pricePerKwh={pricePerKwh}>
                <span className="break-words font-medium cursor-help">电费 {cost}</span>
              </FeeHint>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div className="font-medium">累计对比</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm text-muted-foreground mb-1">昨日</div>
                <div className="break-words text-base font-semibold sm:text-lg">
                  <ValueWithUnit
                    value={numberFormatter2.format(realtime.yesterdayUsage)}
                    unit="kWh"
                    valueClassName="font-semibold"
                  />
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm text-muted-foreground mb-1">本月</div>
                <div className="break-words text-base font-semibold sm:text-lg">
                  <ValueWithUnit
                    value={numberFormatter1.format(realtime.monthUsage)}
                    unit="kWh"
                    valueClassName="font-semibold"
                  />
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm text-muted-foreground mb-1">本年</div>
                <div className="break-words text-base font-semibold sm:text-lg">
                  <ValueWithUnit
                    value={numberFormatter0.format(realtime.yearUsage)}
                    unit="kWh"
                    valueClassName="font-semibold"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
