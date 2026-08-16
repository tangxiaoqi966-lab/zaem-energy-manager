import { AlarmLevel, AlarmType, RoomStatus } from '@shared/index';
import type { VariantProps } from 'class-variance-authority';
import { badgeVariants } from '../components/ui/badge';

export type BadgeVariantType = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const ALARM_TYPE_LABEL: Readonly<Record<AlarmType, string>> = {
  [AlarmType.LIMIT_80]: '80% 用电预警',
  [AlarmType.LIMIT_90]: '90% 用电预警',
  [AlarmType.LIMIT_95]: '95% 用电预警',
  [AlarmType.LIMIT_REACHED]: '达到限额',
  [AlarmType.DEVICE_OFFLINE]: '设备离线',
  [AlarmType.CONTROL_FAILED]: '控制失败',
  [AlarmType.SYNC_FAILED]: '同步失败',
} as const;

export function getAlarmTypeLabel(type: AlarmType): string {
  return ALARM_TYPE_LABEL[type] ?? String(type);
}

export const ALARM_LEVEL_LABEL: Readonly<Record<AlarmLevel, string>> = {
  [AlarmLevel.INFO]: '信息',
  [AlarmLevel.WARNING]: '警告',
  [AlarmLevel.DANGER]: '危险',
  [AlarmLevel.CRITICAL]: '严重',
} as const;

export function getAlarmLevelLabel(level: AlarmLevel): string {
  return ALARM_LEVEL_LABEL[level] ?? String(level);
}

export const ALARM_LEVEL_BADGE_VARIANT: Readonly<
  Record<AlarmLevel, 'secondary' | 'default' | 'destructive'>
> = {
  [AlarmLevel.INFO]: 'secondary',
  [AlarmLevel.WARNING]: 'default',
  [AlarmLevel.DANGER]: 'destructive',
  [AlarmLevel.CRITICAL]: 'destructive',
} as const;

export function getAlarmLevelBadge(
  level: AlarmLevel,
): 'secondary' | 'default' | 'destructive' {
  return ALARM_LEVEL_BADGE_VARIANT[level] ?? 'secondary';
}

export function isWarningAlarm(type: AlarmType): boolean {
  return (
    type === AlarmType.LIMIT_80 ||
    type === AlarmType.LIMIT_90 ||
    type === AlarmType.LIMIT_95
  );
}

export const ROOM_STATUS_CARD_TONE_CLASS: Readonly<Record<RoomStatus, string>> = {
  [RoomStatus.WARNING_80]:
    'border-yellow-300 bg-yellow-50/90 hover:bg-yellow-100/90 dark:border-yellow-700 dark:bg-yellow-950/25 dark:hover:bg-yellow-950/35',
  [RoomStatus.WARNING_90]:
    'border-yellow-300 bg-yellow-50/90 hover:bg-yellow-100/90 dark:border-yellow-700 dark:bg-yellow-950/25 dark:hover:bg-yellow-950/35',
  [RoomStatus.WARNING_95]:
    'border-red-300 bg-red-50/90 hover:bg-red-100/90 dark:border-red-800 dark:bg-red-950/25 dark:hover:bg-red-950/35',
  [RoomStatus.CUTOFF]:
    'border-red-300 bg-red-50/90 hover:bg-red-100/90 dark:border-red-800 dark:bg-red-950/25 dark:hover:bg-red-950/35',
  [RoomStatus.OFFLINE]:
    'border-slate-300 bg-slate-50/90 hover:bg-slate-100/90 dark:border-slate-700 dark:bg-slate-950/25 dark:hover:bg-slate-950/35',
  [RoomStatus.NORMAL]:
    'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 dark:border-emerald-900 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25',
} as const;

export function getRoomStatusCardToneClass(status: RoomStatus): string {
  return (
    ROOM_STATUS_CARD_TONE_CLASS[status] ??
    ROOM_STATUS_CARD_TONE_CLASS[RoomStatus.NORMAL]
  );
}
