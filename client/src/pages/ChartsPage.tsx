import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, LineChart, TrendingUp, Zap, Euro, BatteryCharging } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { DashboardSummary, RoomEnergyDetail } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import EChartsBar from '@/components/charts/EChartsBar';
import EChartsLine from '@/components/charts/EChartsLine';
import { ValueWithUnit, formatValueUnitHtml } from '@/components/ui/value-with-unit';
import { FeeHint } from '@/components/ui/fee-hint';

type PeriodKey = 'day' | 'week' | 'month' | 'year';

interface RankingEntry {
  key: string;
  label: string;
  usage: number;
  powerW: number;
  cost: number;
}

interface TrendSeries {
  labels: string[];
  energy: number[];
  cost: number[];
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
};

const numberFormatter1 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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

function formatPower(value: number) {
  return (
    <ValueWithUnit
      value={numberFormatter1.format(value)}
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
  return currencyFormatter.format(value);
}

function formatPowerHtml(value: number) {
  return formatValueUnitHtml(numberFormatter1.format(value), 'W');
}

function formatEnergyHtml(value: number) {
  return formatValueUnitHtml(numberFormatter2.format(value), 'kWh');
}

function shortenAxisLabel(label: string, maxLength: number) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength)}...`;
}

function getPreviousDayLabel(): string {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return `${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
}

function buildTrendSeries(
  details: RoomEnergyDetail[],
  period: PeriodKey,
  pricePerKwh: number,
): TrendSeries {
  if (details.length === 0) {
    return { labels: [], energy: [], cost: [] };
  }

  if (period === 'day') {
    const labels = details[0]?.today24h.map((item) => `${String(item.hour).padStart(2, '0')}:00`) ?? [];
    const energy = labels.map((_, index) =>
      Number(details.reduce((sum, detail) => sum + (detail.today24h[index]?.usage ?? 0), 0).toFixed(3)),
    );
    return {
      labels,
      energy,
      cost: energy.map((value) => Number((value * pricePerKwh).toFixed(2))),
    };
  }

  if (period === 'week') {
    const labels = details[0]?.last7Days.map((item) => item.date.slice(5)) ?? [];
    const energy = labels.map((_, index) =>
      Number(details.reduce((sum, detail) => sum + (detail.last7Days[index]?.usage ?? 0), 0).toFixed(3)),
    );
    return {
      labels,
      energy,
      cost: energy.map((value) => Number((value * pricePerKwh).toFixed(2))),
    };
  }

  if (period === 'month') {
    const labels = details[0]?.last30Days.map((item) => item.date.slice(5)) ?? [];
    const energy = labels.map((_, index) =>
      Number(details.reduce((sum, detail) => sum + (detail.last30Days[index]?.usage ?? 0), 0).toFixed(3)),
    );
    return {
      labels,
      energy,
      cost: energy.map((value) => Number((value * pricePerKwh).toFixed(2))),
    };
  }

  const labels = details[0]?.last12Months.map((item) => `${item.year}-${String(item.month).padStart(2, '0')}`) ?? [];
  const energy = labels.map((_, index) =>
    Number(details.reduce((sum, detail) => sum + (detail.last12Months[index]?.usage ?? 0), 0).toFixed(3)),
  );
  return {
    labels,
    energy,
    cost: energy.map((value) => Number((value * pricePerKwh).toFixed(2))),
  };
}

function buildRankingEntries(
  summary: DashboardSummary | undefined,
  period: PeriodKey,
  pricePerKwh: number,
): RankingEntry[] {
  if (!summary) return [];

  const dayEntries = summary.roomData
    .filter((room) => room.devices.length > 0)
    .map((room) => {
      const usage = room.yesterdayUsage;

      return {
        key: room.roomId,
        label: room.displayName || room.roomNumber,
        usage: Number(usage.toFixed(3)),
        powerW: room.power,
        cost: usage * pricePerKwh,
      };
    });

  if (period === 'day') {
    return dayEntries
      .filter((item) => item.usage > 0)
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 14);
  }

  return summary.devices
    .map((device, index) => ({
      key: device.did,
      label: device.name || `设备空间 ${index + 1}`,
      usage: Number((device.totalKwh ?? 0).toFixed(3)),
      powerW: device.powerW ?? 0,
      cost: (device.totalKwh ?? 0) * pricePerKwh,
    }))
    .filter((item) => item.usage > 0)
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 14);
}

function getRankingDescription(period: PeriodKey) {
  if (period === 'day') return `按前一天完整日记录排序，当前展示的是 ${getPreviousDayLabel()} 的用电排行。`;
  if (period === 'week') return '按最近 7 天累计用电量排序，适合看最近一周的高耗电房间。';
  if (period === 'month') return '按最近 30 天累计用电量排序，默认按每台设备一个独立空间展示。';
  return '按最近 12 个月累计用电量排序，适合看全年高耗电空间走势。';
}

function getTrendDescription(period: PeriodKey) {
  if (period === 'day') return '按小时汇总今天的累计用电，能看到从早到晚的变化趋势。';
  if (period === 'week') return '按天汇总最近 7 天用电量，适合看最近一周波动。';
  if (period === 'month') return '按天汇总最近 30 天用电量，适合观察月度变化。';
  return '按月汇总最近 12 个月用电量，适合看全年走势。';
}

function getDataHint(period: PeriodKey) {
  if (period === 'day') return `日排行只采用前一天完整日记录，当前日期 ${getPreviousDayLabel()}。下方曲线仍按今天小时累计持续刷新。`;
  if (period === 'week' || period === 'month') {
    return '周/月视图基于日汇总记录。如果当天日汇总还未沉淀完成，最新完整日期可能暂时停留在昨天。';
  }
  return '年视图基于月汇总记录，适合看长期累计变化。';
}

export function ChartsPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [isNarrow, setIsNarrow] = useState(false);

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

  useEffect(() => {
    const updateViewport = () => {
      setIsNarrow(window.innerWidth < 900);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const mappedRooms = useMemo(
    () => summary?.roomData.filter((room) => room.devices.length > 0) ?? [],
    [summary],
  );

  const roomDetailQueries = useQueries({
    queries: mappedRooms.map((room) => ({
      queryKey: ['room-chart', room.roomId],
      queryFn: () => api.energy.getRoom(room.roomId),
      enabled: !!room.roomId,
      refetchOnWindowFocus: false,
      refetchInterval: 15000,
      refetchIntervalInBackground: true,
      staleTime: 1000 * 10,
    })),
  });

  const roomDetails = useMemo(
    () => roomDetailQueries.map((query) => query.data).filter(Boolean) as RoomEnergyDetail[],
    [roomDetailQueries],
  );

  const pricePerKwh = settings?.pricePerKwh ?? 0.6;
  const rankingEntries = useMemo(
    () => buildRankingEntries(summary, period, pricePerKwh),
    [summary, period, pricePerKwh],
  );

  const trendSeries = useMemo(
    () => buildTrendSeries(roomDetails, period, pricePerKwh),
    [roomDetails, period, pricePerKwh],
  );

  const totalPowerW = useMemo(
    () => summary?.devices.reduce((sum, device) => sum + (device.status === 'online' ? device.powerW ?? 0 : 0), 0) ?? 0,
    [summary],
  );

  const totalCumulativeKwh = useMemo(
    () => summary?.devices.reduce((sum, device) => sum + (device.totalKwh ?? 0), 0) ?? 0,
    [summary],
  );

  const selectedTotalUsage = useMemo(
    () => trendSeries.energy.reduce((sum, value) => sum + value, 0),
    [trendSeries],
  );

  const rankingOption = useMemo<EChartsOption>(() => {
    if (rankingEntries.length === 0) {
      return {
        title: {
          text: '暂无可展示的排行数据',
          left: 'center',
          top: 'center',
          textStyle: { color: '#9ca3af', fontSize: 14, fontWeight: 400 },
        },
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        confine: true,
        enterable: false,
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as Array<{ seriesName: string; axisValue: string; data?: { value?: number; powerW?: number; cost?: number }; value?: number }>;
          const energyItem = list.find((item) => item.seriesName === '累计电量');
          const costItem = list.find((item) => item.seriesName === '参考费用');
          const powerW = Number(energyItem?.data?.powerW ?? 0);
          const usage = Number(energyItem?.data?.value ?? energyItem?.value ?? 0);
          const cost = Number(energyItem?.data?.cost ?? costItem?.value ?? 0);
          return [
            `${list[0]?.axisValue ?? ''}`,
            `用电量: ${formatEnergyHtml(usage)}`,
            `当前功率: ${formatPowerHtml(powerW)}`,
            `参考费用: <b>${formatCost(cost)}</b>`,
          ].join('<br/>');
        },
      },
      grid: {
        left: 24,
        right: 24,
        top: 44,
        bottom: isNarrow ? 112 : 82,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: rankingEntries.map((item) => item.label),
        axisLabel: {
          color: '#4b5563',
          fontSize: isNarrow ? 10 : 11,
          interval: rankingEntries.length > (isNarrow ? 7 : 10) ? 1 : 0,
          rotate: isNarrow || rankingEntries.length > 8 ? 32 : 18,
          hideOverlap: true,
          width: isNarrow ? 44 : 84,
          overflow: 'truncate',
          formatter: (value: string) => shortenAxisLabel(value, isNarrow ? 6 : 10),
          margin: 14,
        },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'kWh',
          nameLocation: 'end',
          nameGap: 18,
          nameTextStyle: { color: '#9ca3af', fontSize: 11 },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => numberFormatter1.format(value),
          },
          splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        },
        {
          type: 'value',
          name: 'EUR',
          nameLocation: 'end',
          nameGap: 18,
          nameTextStyle: { color: '#9ca3af', fontSize: 11 },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => numberFormatter2.format(value),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '累计电量',
          type: 'bar',
          barMaxWidth: 34,
          showBackground: true,
          backgroundStyle: {
            color: 'rgba(99, 102, 241, 0.10)',
            borderRadius: [8, 8, 0, 0],
          },
          data: rankingEntries.map((item) => ({
            value: Number(item.usage.toFixed(2)),
            powerW: item.powerW,
            cost: item.cost,
          })),
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#4f46e5' },
                { offset: 0.55, color: '#7c3aed' },
                { offset: 1, color: '#c084fc' },
              ],
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 14,
              shadowColor: 'rgba(99, 102, 241, 0.28)',
            },
          },
          label: {
            show: true,
            position: 'top',
            color: '#6b7280',
            fontSize: 11,
            formatter: (params: any) => numberFormatter2.format(Number(params?.value ?? 0)),
          },
        },
        {
          name: '参考费用',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          data: rankingEntries.map((item) => Number(item.cost.toFixed(2))),
          lineStyle: {
            width: 2,
            color: '#f59e0b',
          },
          itemStyle: {
            color: '#f59e0b',
          },
        },
      ],
    };
  }, [isNarrow, rankingEntries, pricePerKwh]);

  const trendOption = useMemo<EChartsOption>(() => {
    if (trendSeries.labels.length === 0) {
      return {
        title: {
          text: '暂无可展示的趋势数据',
          left: 'center',
          top: 'center',
          textStyle: { color: '#9ca3af', fontSize: 14, fontWeight: 400 },
        },
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        triggerOn: 'mousemove|click',
        confine: true,
        enterable: false,
        formatter: (params: unknown) => {
          const list = params as Array<{ axisValue: string; seriesName: string; value: number }>;
          const title = list[0]?.axisValue ?? '';
          return [
            title,
            ...list.map((item) =>
              item.seriesName === '参考费用'
                ? `${item.seriesName}: <b>${formatCost(item.value)}</b>`
                : `${item.seriesName}: ${formatEnergyHtml(item.value)}`,
            ),
          ].join('<br/>');
        },
      },
      grid: {
        left: 24,
        right: 24,
        top: 56,
        bottom: isNarrow ? 64 : 32,
        containLabel: true,
      },
      legend: {
        top: 8,
        right: 0,
        textStyle: { color: '#6b7280', fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: trendSeries.labels,
        axisLabel: {
          color: '#6b7280',
          fontSize: isNarrow ? 10 : 11,
          interval:
            period === 'month'
              ? (isNarrow ? 5 : 4)
              : trendSeries.labels.length > (isNarrow ? 8 : 12)
                ? 1
                : 0,
          rotate: isNarrow && period !== 'year' ? 30 : 0,
          hideOverlap: true,
          margin: 12,
          formatter: (value: string) => shortenAxisLabel(value, isNarrow ? 5 : 8),
        },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'kWh',
          nameLocation: 'end',
          nameGap: 18,
          nameTextStyle: { color: '#9ca3af', fontSize: 11 },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => numberFormatter1.format(value),
          },
          splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        },
        {
          type: 'value',
          name: 'EUR',
          nameLocation: 'end',
          nameGap: 18,
          nameTextStyle: { color: '#9ca3af', fontSize: 11 },
          axisLabel: {
            color: '#6b7280',
            formatter: (value: number) => numberFormatter2.format(value),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '累计电量',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          data: trendSeries.energy,
          yAxisIndex: 0,
          lineStyle: { width: 3, color: '#6366f1' },
          itemStyle: { color: '#6366f1' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99, 102, 241, 0.25)' },
                { offset: 1, color: 'rgba(99, 102, 241, 0.03)' },
              ],
            },
          },
        },
        {
          name: '参考费用',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          data: trendSeries.cost,
          yAxisIndex: 1,
          lineStyle: { width: 2, type: 'dashed', color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [isNarrow, period, trendSeries]);

  const loading = summaryLoading || (mappedRooms.length > 0 && roomDetailQueries.some((query) => query.isLoading && !query.data));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">图表</h1>
          <p className="text-sm text-muted-foreground">
            统一查看用电排行、周期趋势、参考费用和当前总功率
          </p>
        </div>
      </div>

      <Tabs value={period} onValueChange={(value) => setPeriod(value as PeriodKey)} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="grid h-auto w-full max-w-md grid-cols-4">
            <TabsTrigger value="day" className="px-2 text-xs sm:text-sm">日</TabsTrigger>
            <TabsTrigger value="week" className="px-2 text-xs sm:text-sm">周</TabsTrigger>
            <TabsTrigger value="month" className="px-2 text-xs sm:text-sm">月</TabsTrigger>
            <TabsTrigger value="year" className="px-2 text-xs sm:text-sm">年</TabsTrigger>
          </TabsList>
          <Badge variant="outline" className="text-xs">
            当前查看：{PERIOD_LABEL[period]}视图
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              {PERIOD_LABEL[period]}用电排行
            </CardTitle>
            <CardDescription>{getRankingDescription(period)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="h-[460px] w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <EChartsBar option={rankingOption} style={{ width: '100%', height: 460 }} />
            )}
            {isNarrow ? (
              <div className="text-xs text-muted-foreground">
                手机端点一下柱子即可查看详细数值，再点别处可收起提示。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-indigo-600" />
              {PERIOD_LABEL[period]}趋势与费用
            </CardTitle>
            <CardDescription>{getTrendDescription(period)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4 text-indigo-600" />
                  当前总功率
                </div>
                <div className="mt-2 text-2xl font-semibold">{formatPower(totalPowerW)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BatteryCharging className="h-4 w-4 text-indigo-600" />
                  当前用电量
                </div>
                <div className="mt-2 text-2xl font-semibold">{formatEnergy(totalCumulativeKwh)}</div>
              </div>
              <FeeHint pricePerKwh={pricePerKwh}>
                <div className="col-span-2 cursor-help rounded-lg border bg-muted/30 p-4 md:col-span-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Euro className="h-4 w-4 text-indigo-600" />
                    {PERIOD_LABEL[period]}参考费用
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{formatCost(selectedTotalUsage * pricePerKwh)}</div>
                </div>
              </FeeHint>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {getDataHint(period)}
            </div>

            {loading ? (
              <div className="h-[460px] w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <EChartsLine option={trendOption} style={{ width: '100%', height: 460 }} />
            )}
            {isNarrow ? (
              <div className="text-xs text-muted-foreground">
                手机端点一下折线节点即可查看详细数值，左右拖动也能连续看各时间点。
              </div>
            ) : null}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

export default ChartsPage;
