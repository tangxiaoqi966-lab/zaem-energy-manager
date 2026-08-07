import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { cn } from '../../lib/utils';

interface EChartsLineProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
}

export function EChartsLine({ option, style, className }: EChartsLineProps) {
  return (
    <ReactECharts
      option={option}
      style={style}
      className={cn(className)}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}

export default EChartsLine;
