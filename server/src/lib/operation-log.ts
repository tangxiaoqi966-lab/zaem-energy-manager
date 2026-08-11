import { OperationType } from '@prisma/client';

export type OperationSource =
  | 'web_desktop'
  | 'web_mobile'
  | 'mobile_app'
  | 'api_client'
  | 'system_auto'
  | 'unknown';

export interface OperationActorContext {
  source?: OperationSource;
  sourceLabel?: string;
  ip?: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
}

export interface OperationDetailsPayload {
  action?: string;
  actionLabel?: string;
  source?: OperationSource;
  sourceLabel?: string;
  roomNumber?: string | null;
  roomName?: string | null;
  displayName?: string | null;
  did?: string | null;
  deviceName?: string | null;
  limitEnabled?: boolean;
  dailyLimit?: number | null;
  powerAction?: 'on' | 'off' | null;
  blocked?: boolean;
  retryAfterSeconds?: number | null;
  deletedCount?: number | null;
  filters?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  username?: string | null;
  loginAddress?: string | null;
  loginDevice?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  error?: string | null;
  note?: string | null;
  reason?: string | null;
  actionResult?: string | null;
  successCount?: number | null;
  failedCount?: number | null;
  totalCount?: number | null;
  failedDevices?: string[] | null;
  [key: string]: unknown;
}

export interface OperationTargetInfo {
  roomNumber: string | null;
  roomName: string | null;
  displayName: string | null;
  deviceName: string | null;
  did: string | null;
}

export function serializeOperationDetails(
  details: string | OperationDetailsPayload,
): string {
  if (typeof details === 'string') {
    return details;
  }
  return JSON.stringify(details);
}

export function parseOperationDetails(
  details: string | null | undefined,
): string | OperationDetailsPayload {
  if (!details) {
    return '';
  }

  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OperationDetailsPayload;
    }
  } catch {
  }

  return details;
}

export function getOperationSourceLabel(source?: string | null): string | null {
  switch (source) {
    case 'web_desktop':
      return '网页-PC端';
    case 'web_mobile':
      return '网页-手机端';
    case 'mobile_app':
      return 'APP';
    case 'api_client':
      return '接口客户端';
    case 'system_auto':
      return '系统自动';
    case 'unknown':
      return '未知来源';
    default:
      return null;
  }
}

export function getDefaultActionLabel(type: OperationType): string {
  switch (type) {
    case OperationType.login:
      return '登录';
    case OperationType.logout:
      return '退出登录';
    case OperationType.update_limit:
      return '修改日限额';
    case OperationType.cutoff_power:
      return '断电';
    case OperationType.restore_power:
      return '恢复供电';
    case OperationType.update_alarm:
      return '处理报警';
    case OperationType.update_settings:
      return '修改系统设置';
    case OperationType.sync_devices:
      return '同步设备';
    case OperationType.control_device:
      return '控制设备';
    default:
      return String(type);
  }
}

function pushLine(lines: string[], label: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return;
  }
  lines.push(`${label}：${String(value)}`);
}

function formatRoomLabel(parsed: OperationDetailsPayload): string | null {
  const displayName =
    typeof parsed.displayName === 'string' && parsed.displayName.trim()
      ? parsed.displayName.trim()
      : null;
  const roomNumber =
    typeof parsed.roomNumber === 'string' && parsed.roomNumber.trim()
      ? parsed.roomNumber.trim()
      : null;

  if (displayName && roomNumber && displayName !== roomNumber) {
    return `${displayName} (${roomNumber})`;
  }

  return displayName || roomNumber;
}

function formatDeviceLabel(parsed: OperationDetailsPayload): string | null {
  const deviceName =
    typeof parsed.deviceName === 'string' && parsed.deviceName.trim()
      ? parsed.deviceName.trim()
      : null;
  const did =
    typeof parsed.did === 'string' && parsed.did.trim()
      ? parsed.did.trim()
      : null;

  if (deviceName && did) {
    return `${deviceName} (${did})`;
  }

  return deviceName || did;
}

function formatFilters(filters: Record<string, unknown> | null | undefined): string | null {
  if (!filters) {
    return null;
  }

  const pairs = Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 'all')
    .map(([key, value]) => `${key}=${String(value)}`);

  return pairs.length > 0 ? pairs.join('，') : null;
}

function formatSettings(settings: Record<string, unknown> | null | undefined): string | null {
  if (!settings) {
    return null;
  }

  const pairs = Object.entries(settings).map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? pairs.join('，') : null;
}

export function getOperationTargetInfo(
  rawDetails: string | null | undefined,
): OperationTargetInfo {
  const parsed = parseOperationDetails(rawDetails);
  if (typeof parsed === 'string') {
    return {
      roomNumber: null,
      roomName: null,
      displayName: null,
      deviceName: null,
      did: null,
    };
  }

  return {
    roomNumber:
      typeof parsed.roomNumber === 'string' && parsed.roomNumber.trim()
        ? parsed.roomNumber.trim()
        : null,
    roomName:
      typeof parsed.roomName === 'string' && parsed.roomName.trim()
        ? parsed.roomName.trim()
        : null,
    displayName:
      typeof parsed.displayName === 'string' && parsed.displayName.trim()
        ? parsed.displayName.trim()
        : null,
    deviceName:
      typeof parsed.deviceName === 'string' && parsed.deviceName.trim()
        ? parsed.deviceName.trim()
        : null,
    did:
      typeof parsed.did === 'string' && parsed.did.trim()
        ? parsed.did.trim()
        : null,
  };
}

export function formatOperationDetailsText(
  type: OperationType,
  rawDetails: string,
): string {
  const parsed = parseOperationDetails(rawDetails);
  if (typeof parsed === 'string') {
    return parsed;
  }

  const actionLabel = parsed.actionLabel || getDefaultActionLabel(type);
  const sourceLabel = parsed.sourceLabel || getOperationSourceLabel(parsed.source);
  const roomLabel = formatRoomLabel(parsed);
  const deviceLabel = formatDeviceLabel(parsed);

  const lines: string[] = [];
  pushLine(lines, '动作', actionLabel);
  pushLine(lines, '来源', sourceLabel);
  pushLine(lines, '房间', roomLabel);
  pushLine(lines, '设备', deviceLabel);

  if (parsed.dailyLimit !== undefined && parsed.dailyLimit !== null) {
    pushLine(lines, '限额', `${parsed.dailyLimit} kWh/天`);
  }

  if (typeof parsed.limitEnabled === 'boolean') {
    pushLine(lines, '限额断电', parsed.limitEnabled ? '开启' : '关闭');
  }

  if (parsed.powerAction === 'on' || parsed.powerAction === 'off') {
    pushLine(lines, '电源动作', parsed.powerAction === 'on' ? '开启电源' : '关闭电源');
  }

  if (parsed.blocked) {
    pushLine(lines, '限制', '命中 3 分钟冷却保护');
  }
  pushLine(lines, '冷却剩余', parsed.retryAfterSeconds ? `${parsed.retryAfterSeconds} 秒` : null);
  pushLine(lines, '删除数量', parsed.deletedCount);
  pushLine(lines, '成功数量', parsed.successCount);
  pushLine(lines, '失败数量', parsed.failedCount);
  pushLine(lines, '总数量', parsed.totalCount);
  pushLine(lines, '失败设备', parsed.failedDevices?.join('，'));
  pushLine(lines, '登录账号', parsed.username);
  pushLine(lines, '登录地址', parsed.loginAddress || parsed.ip);
  pushLine(lines, '登录设备', parsed.loginDevice || parsed.deviceLabel);
  pushLine(lines, '失败原因', parsed.error || parsed.reason);
  pushLine(lines, '说明', parsed.note || parsed.actionResult);
  pushLine(lines, '筛选条件', formatFilters(parsed.filters));
  pushLine(lines, '设置变更', formatSettings(parsed.settings));

  return lines.join('\n') || rawDetails;
}

export function getOperationActorLabel(
  username: string | null | undefined,
  rawDetails: string,
): string | null {
  if (username) {
    return username;
  }

  const parsed = parseOperationDetails(rawDetails);
  if (typeof parsed === 'string') {
    return null;
  }

  if (parsed.source === 'system_auto') {
    return '系统自动';
  }

  if (parsed.username) {
    return String(parsed.username);
  }

  return null;
}
