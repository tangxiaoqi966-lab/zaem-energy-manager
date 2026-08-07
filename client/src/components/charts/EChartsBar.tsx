import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { cn } from '../../lib/utils';

interface EChartsBarProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
}

export function EChartsBar({ option, style, className }: EChartsBarProps) {
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

export default EChartsBar;
