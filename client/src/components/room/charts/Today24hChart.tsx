import type { CSSProperties } from 'react';
import type { HourlyDataPoint } from '@/types';
import { EChartsLine } from '@/components/charts/EChartsLine';
import type { EChartsOption } from 'echarts';
import { formatValueUnitHtml } from '@/components/ui/value-with-unit';

interface Today24hChartProps {
  data: HourlyDataPoint[];
  style?: CSSProperties;
}

export function Today24hChart({ data, style }: Today24hChartProps) {
  const xAxisData = Array.from({ length: 24 }, (_, i) => `${i}时`);
  const fullData = Array.from({ length: 24 }, (_, i) => {
    const point = data.find((d) => d.hour === i);
    return point?.usage ?? 0;
  });

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = params as Array<{ name: string; value: number }>;
        if (!p || p.length === 0) return '';
        return `${p[0].name}<br/>用电: ${formatValueUnitHtml(Number(p[0].value).toFixed(2), 'kWh')}`;
      },
    },
    grid: {
      left: 48,
      right: 16,
      top: 16,
      bottom: 32,
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      boundaryGap: false,
      axisLabel: {
        interval: 2,
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      name: 'kWh',
      nameTextStyle: {
        fontSize: 10,
        color: '#9ca3af',
      },
      axisLabel: {
        fontSize: 11,
      },
    },
    series: [
      {
        type: 'line',
        data: fullData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2,
          color: '#3b82f6',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.35)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
            ],
          },
        },
        itemStyle: {
          color: '#3b82f6',
        },
      },
    ],
  };

  return (
    <EChartsLine
      option={option}
      style={{ height: 300, width: '100%', ...style }}
    />
  );
}
