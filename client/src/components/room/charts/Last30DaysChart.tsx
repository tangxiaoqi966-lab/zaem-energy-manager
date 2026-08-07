import type { CSSProperties } from 'react';
import type { DailyDataPoint } from '@/types';
import { EChartsLine } from '@/components/charts/EChartsLine';
import type { EChartsOption } from 'echarts';
import { formatValueUnitHtml } from '@/components/ui/value-with-unit';

interface Last30DaysChartProps {
  data: DailyDataPoint[];
  style?: CSSProperties;
}

function computeMA5(data: number[]): (number | string)[] {
  const result: (number | string)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < 4) {
      result.push('-');
    } else {
      const sum =
        data[i - 4] + data[i - 3] + data[i - 2] + data[i - 1] + data[i];
      result.push(Number((sum / 5).toFixed(3)));
    }
  }
  return result;
}

export function Last30DaysChart({ data, style }: Last30DaysChartProps) {
  const xAxisData = data.map((d) => {
    const parts = d.date.split('-');
    return `${parts[1]}-${parts[2]}`;
  });
  const values = data.map((d) => d.usage);
  const ma5 = computeMA5(values);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = params as Array<{
          seriesName: string;
          name: string;
          value: number | string;
        }>;
        if (!p || p.length === 0) return '';
        let result = `${p[0].name}<br/>`;
        p.forEach((item) => {
          if (typeof item.value === 'number') {
            result += `${item.seriesName}: ${formatValueUnitHtml(item.value.toFixed(2), 'kWh')}<br/>`;
          }
        });
        return result;
      },
    },
    legend: {
      data: ['每日用电', 'MA5(5日均值)'],
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: {
        fontSize: 11,
      },
    },
    grid: {
      left: 48,
      right: 16,
      top: 40,
      bottom: 32,
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      boundaryGap: false,
      axisLabel: {
        interval: 4,
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
        name: '每日用电',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: {
          width: 2,
          color: '#a855f7',
        },
        itemStyle: {
          color: '#a855f7',
        },
      },
      {
        name: 'MA5(5日均值)',
        type: 'line',
        data: ma5,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 1.5,
          color: '#f59e0b',
          type: 'dashed',
        },
        itemStyle: {
          color: '#f59e0b',
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
