import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ValueWithUnitProps {
  value: ReactNode;
  unit: string;
  className?: string;
  valueClassName?: string;
  unitClassName?: string;
}

export function ValueWithUnit({
  value,
  unit,
  className,
  valueClassName,
  unitClassName,
}: ValueWithUnitProps) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <span className={cn('font-semibold', valueClassName)}>{value}</span>
      <span className={cn('text-xs text-muted-foreground', unitClassName)}>{unit}</span>
    </span>
  );
}

export function formatValueUnitHtml(
  value: string | number,
  unit: string,
  options?: {
    valueWeight?: number | string;
    unitColor?: string;
    unitSizePx?: number;
    gapPx?: number;
  },
) {
  const valueWeight = options?.valueWeight ?? 600;
  const unitColor = options?.unitColor ?? '#9ca3af';
  const unitSizePx = options?.unitSizePx ?? 11;
  const gapPx = options?.gapPx ?? 4;

  return [
    `<span style="font-weight:${valueWeight};">${value}</span>`,
    `<span style="margin-left:${gapPx}px;font-size:${unitSizePx}px;color:${unitColor};font-weight:400;">${unit}</span>`,
  ].join('');
}

export default ValueWithUnit;
