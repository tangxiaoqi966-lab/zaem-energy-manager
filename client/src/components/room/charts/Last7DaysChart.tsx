import type { CSSProperties } from 'react';
import type { DailyDataPoint } from '@/types';
import { EChartsBar } from '@/components/charts/EChartsBar';
import type { EChartsOption } from 'echarts';
import { formatValueUnitHtml } from '@/components/ui/value-with-unit';

interface Last7DaysChartProps {
  data: DailyDataPoint[];
  style?: CSSProperties;
}

export function Last7DaysChart({ data, style }: Last7DaysChartProps) {
  const xAxisData = data.map((d) => {
    const parts = d.date.split('-');
    return `${parts[1]}-${parts[2]}`;
  });
  const values = data.map((d) => d.usage);

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
      top: 32,
      bottom: 32,
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
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
        type: 'bar',
        data: values,
        barWidth: '50%',
        itemStyle: {
          color: '#22c55e',
          borderRadius: [4, 4, 0, 0],
        },
        label: {
          show: true,
          position: 'top',
          fontSize: 11,
          formatter: (params: unknown) => {
            const p = params as { value: number };
            return Number(p.value).toFixed(1);
          },
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
