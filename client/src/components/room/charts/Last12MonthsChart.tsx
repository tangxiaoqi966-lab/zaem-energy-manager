import type { CSSProperties } from 'react';
import type { MonthlyDataPoint } from '@/types';
import { EChartsBar } from '@/components/charts/EChartsBar';
import type { EChartsOption } from 'echarts';
import { formatValueUnitHtml } from '@/components/ui/value-with-unit';

interface Last12MonthsChartProps {
  data: MonthlyDataPoint[];
  style?: CSSProperties;
}

export function Last12MonthsChart({ data, style }: Last12MonthsChartProps) {
  const xAxisData = data.map((d) => {
    const y = String(d.year ?? new Date().getFullYear()).slice(-2);
    const m = String(d.month ?? 0).padStart(2, '0');
    return `${y}-${m}`;
  });
  const values = data.map((d) => d.usage);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = params as Array<{ name: string; value: number }>;
        if (!p || p.length === 0) return '';
        return `${p[0].name}<br/>用电: ${formatValueUnitHtml(Number(p[0].value).toFixed(1), 'kWh')}`;
      },
    },
    grid: {
      left: 56,
      right: 16,
      top: 16,
      bottom: 40,
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        interval: 0,
        fontSize: 11,
        rotate: 30,
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
        type: 'bar',
        data: values,
        barWidth: '55%',
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#fb923c' },
              { offset: 1, color: '#f97316' },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };

  return (
    <EChartsBar
      option={option}
      style={{ height: 300, width: '100%', ...style }}
    />
  );
}
