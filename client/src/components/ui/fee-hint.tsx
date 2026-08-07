import { cloneElement, isValidElement, type MouseEvent, type ReactElement } from 'react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface FeeHintProps {
  pricePerKwh: number;
  children: ReactElement;
  stopPropagationOnMobile?: boolean;
}

const currencyFormatter = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isMobileLike(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none), (pointer: coarse), (max-width: 768px)').matches;
}

export function FeeHint({
  pricePerKwh,
  children,
  stopPropagationOnMobile = false,
}: FeeHintProps) {
  const message = `这里显示的是参考电费，按系统设置里的电价计算。那边电价设准了，这里的金额才会准确。当前电价：${currencyFormatter.format(pricePerKwh)} / 度`;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!isMobileLike()) return;
    if (stopPropagationOnMobile) {
      event.stopPropagation();
      event.preventDefault();
    }
    toast(message);
  };

  const triggerChild = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          const originalOnClick = (children.props as { onClick?: (event: MouseEvent<HTMLElement>) => void }).onClick;
          originalOnClick?.(event);
          if (!event.defaultPrevented) {
            handleClick(event);
          }
        },
      })
    : children;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{triggerChild}</TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-5">
          这里显示的是参考电费，按系统设置里的电价计算。那边电价设准了，这里的金额才会准确。
          <div className="mt-1">当前电价：{currencyFormatter.format(pricePerKwh)} / 度</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FeeHint;
