import type { ElementType, ReactNode } from 'react';
import { Zap, DollarSign, Cpu, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import type { DashboardSummary } from '../../types';
import { cn } from '../../lib/utils';
import { ValueWithUnit } from '../ui/value-with-unit';
import { FeeHint } from '../../components/ui/fee-hint';

interface StatsCardsProps {
  summary: DashboardSummary;
  pricePerKwh: number;
}

interface StatItem {
  key: string;
  label: string;
  value?: ReactNode;
  valueNode?: ReactNode;
  icon: ElementType;
  iconBg: string;
  iconColor: string;
  badge?: {
    text: string;
    variant: 'success' | 'danger' | 'warning' | 'default';
  };
}

const numberFormatter2 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatEnergy(value: number) {
  return (
    <ValueWithUnit
      value={numberFormatter2.format(value)}
      unit="kWh"
      valueClassName="font-bold"
    />
  );
}

function formatCost(value: number) {
  return currencyFormatter.format(value);
}

export function StatsCards({ summary, pricePerKwh }: StatsCardsProps) {
  const totalCumulativeKwh = summary.devices.reduce(
    (sum, device) => sum + (device.totalKwh ?? 0),
    0,
  );
  const fallbackEnergy = summary.todayTotalUsage > 0
    ? summary.todayTotalUsage
    : totalCumulativeKwh;
  const fallbackCost = summary.todayTotalUsage > 0
    ? summary.estimatedCost
    : totalCumulativeKwh * pricePerKwh;
  const stats: StatItem[] = [
    {
      key: 'energy',
      label: summary.todayTotalUsage > 0 ? '今日总用电' : '当前累计电量',
      value: formatEnergy(fallbackEnergy),
      icon: Zap,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
    },
    {
      key: 'cost',
      label: summary.todayTotalUsage > 0 ? '今日总费用' : '累计参考费用',
      value: formatCost(fallbackCost),
      icon: DollarSign,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
    },
    {
      key: 'status',
      label: '设备状态',
      valueNode: (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <div className="inline-flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-green-600" />
            <span className="text-sm font-semibold">{summary.onlineDevices}</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5 text-red-600" />
            <span className="text-sm font-semibold">{summary.offlineDevices}</span>
          </div>
        </div>
      ),
      icon: Cpu,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-500',
      badge: { text: `总 ${summary.totalDevices}`, variant: 'default' },
    },
    {
      key: 'alarm',
      label: '报警数量',
      value: `${summary.alarmCount}`,
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-500',
      badge: { text: '告警', variant: 'warning' },
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const card = (
          <Card key={stat.label}>
            <CardContent className="p-2.5 sm:p-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn('rounded-lg p-2 shrink-0', stat.iconBg)}>
                  <Icon className={cn('h-4 w-4', stat.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{stat.label}</p>
                    {stat.badge && (
                      <Badge variant={stat.badge.variant} className="shrink-0 text-[10px] px-1.5 py-0">
                        {stat.badge.text}
                      </Badge>
                    )}
                  </div>
                  {stat.valueNode ? (
                    <div>{stat.valueNode}</div>
                  ) : (
                    <div className="mt-1 text-sm font-bold sm:text-lg">{stat.value}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );

        if (stat.key === 'cost') {
          return (
            <FeeHint key={stat.label} pricePerKwh={pricePerKwh}>
              <div className="cursor-help">{card}</div>
            </FeeHint>
          );
        }

        return card;
      })}
    </div>
  );
}

export default StatsCards;
