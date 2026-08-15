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
  locationLabel?: string | null;
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
  deviceDid?: string | null;
  deviceName?: string | null;
  adapterKind?: 'huawei_cpe' | 'nokia_beacon' | string | null;
  adapterBaseUrl?: string | null;
  limitEnabled?: boolean;
  dailyLimit?: number | null;
  costLimitEnabled?: boolean;
  monthlyCostLimit?: number | null;
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
  skippedCount?: number | null;
  totalCount?: number | null;
  failedDevices?: string[] | null;
  failedRooms?: string[] | null;
  skippedRooms?: string[] | null;
  startedAt?: string | null;
  recoveredAt?: string | null;
  durationMinutes?: number | null;
  resultLabel?: string | null;
  [key: string]: unknown;
}

export interface OperationTargetInfo {
  roomNumber: string | null;
  roomName: string | null;
  displayName: string | null;
  deviceName: string | null;
  did: string | null;
}

export type OperationLogCategory =
  | 'auth'
  | 'room_power'
  | 'network'
  | 'camera'
  | 'room'
  | 'alarm'
  | 'device_sync'
  | 'system'
  | 'other';

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

  let current: unknown = details;

  for (let i = 0; i < 2; i += 1) {
    if (typeof current !== 'string') {
      break;
    }

    try {
      const parsed = JSON.parse(current);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as OperationDetailsPayload;
      }
      current = parsed;
    } catch {
      break;
    }
  }

  return typeof current === 'string' ? current : details;
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

function formatDateTimeValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(dt);
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

  return displayName || roomNumber;
}

function normalizeUnknownLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\*?\s*no company\s*\*?$/i.test(text)) return null;
  return text;
}

function getFallbackNetworkDeviceLabel(parsed: OperationDetailsPayload): string | null {
  const did =
    normalizeUnknownLabel(parsed.did) ||
    normalizeUnknownLabel(parsed.deviceDid);
  if (parsed.adapterKind === 'huawei_cpe') {
    return did ? `Huawei 主路由 (${did})` : 'Huawei 主路由';
  }
  if (parsed.adapterKind === 'nokia_beacon') {
    return did ? `Nokia Mesh 网关 (${did})` : 'Nokia Mesh 网关';
  }
  return null;
}

function formatDeviceLabel(parsed: OperationDetailsPayload): string | null {
  const deviceName = normalizeUnknownLabel(parsed.deviceName);
  const did =
    normalizeUnknownLabel(parsed.did) ||
    normalizeUnknownLabel(parsed.deviceDid);
  const fallbackNetworkLabel = getFallbackNetworkDeviceLabel(parsed);

  if (deviceName && did) {
    return `${deviceName} (${did})`;
  }

  return deviceName || fallbackNetworkLabel || did;
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
      normalizeUnknownLabel(parsed.deviceName) || getFallbackNetworkDeviceLabel(parsed),
    did:
      typeof parsed.did === 'string' && parsed.did.trim()
        ? parsed.did.trim()
        : typeof parsed.deviceDid === 'string' && parsed.deviceDid.trim()
          ? parsed.deviceDid.trim()
        : null,
  };
}

export function getOperationCategory(
  type: OperationType,
  rawDetails: string | null | undefined,
): OperationLogCategory {
  const parsed = parseOperationDetails(rawDetails);
  if (type === OperationType.login || type === OperationType.logout) {
    return 'auth';
  }
  if (type === OperationType.update_alarm) {
    return 'alarm';
  }
  if (type === OperationType.update_limit || type === OperationType.cutoff_power || type === OperationType.restore_power) {
    return 'room_power';
  }
  if (typeof parsed === 'string') {
    return type === OperationType.sync_devices ? 'device_sync' : type === OperationType.update_settings ? 'system' : 'other';
  }

  const action = String(parsed.action ?? '').trim().toLowerCase();
  const text = [
    parsed.actionLabel,
    parsed.deviceName,
    parsed.displayName,
    parsed.roomName,
    parsed.roomNumber,
    parsed.did,
    parsed.deviceDid,
    parsed.adapterKind,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();

  if (
    parsed.adapterKind === 'huawei_cpe' ||
    parsed.adapterKind === 'nokia_beacon' ||
    action === 'save_device_adapter_config' ||
    action === 'refresh_device_runtime' ||
    /^lan_/i.test(String(parsed.did ?? parsed.deviceDid ?? '')) ||
    /mesh|beacon|cpe|router|路由|网关/.test(text)
  ) {
    return 'network';
  }

  if (
    /camera|摄像/.test(text) ||
    action.includes('camera')
  ) {
    return 'camera';
  }

  if (
    action === 'rename_device' ||
    action === 'update_room_annotation' ||
    action === 'update_room_floor' ||
    (!!parsed.roomNumber && type === OperationType.update_settings)
  ) {
    return 'room';
  }

  if (
    action === 'create_user' ||
    action === 'update_user' ||
    action === 'delete_user' ||
    action === 'force_change_password'
  ) {
    return 'auth';
  }

  if (type === OperationType.sync_devices) {
    return 'device_sync';
  }

  if (type === OperationType.update_settings) {
    return 'system';
  }

  return 'other';
}

export function getOperationCategoryLabel(category: OperationLogCategory): string {
  switch (category) {
    case 'auth':
      return '账号登录';
    case 'room_power':
      return '房间电力';
    case 'network':
      return '网络设备';
    case 'camera':
      return '摄像头';
    case 'room':
      return '房间信息';
    case 'alarm':
      return '报警处理';
    case 'device_sync':
      return '设备同步';
    case 'system':
      return '系统设置';
    default:
      return '其他';
  }
}

export function formatOperationDetailsText(
  type: OperationType,
  rawDetails: string,
): string {
  const parsed = parseOperationDetails(rawDetails);
  if (typeof parsed === 'string') {
    return parsed;
  }

  const actionLabel =
    parsed.actionLabel ||
    inferActionLabel(type, parsed) ||
    getDefaultActionLabel(type);
  const sourceLabel = parsed.sourceLabel || getOperationSourceLabel(parsed.source);
  const roomLabel = formatRoomLabel(parsed);
  const deviceLabel = formatDeviceLabel(parsed);

  const lines: string[] = [];
  pushLine(lines, '动作', actionLabel);
  pushLine(lines, '来源', sourceLabel);
  pushLine(lines, '房间', roomLabel);
  pushLine(lines, '设备', deviceLabel);
  pushLine(lines, '管理地址', parsed.adapterBaseUrl);

  if (parsed.dailyLimit !== undefined && parsed.dailyLimit !== null) {
    pushLine(lines, '限额', `${parsed.dailyLimit} kWh/天`);
  }

  if (typeof parsed.limitEnabled === 'boolean') {
    pushLine(lines, '限额断电', parsed.limitEnabled ? '开启' : '关闭');
  }

  if (parsed.monthlyCostLimit !== undefined && parsed.monthlyCostLimit !== null) {
    pushLine(lines, '费用限额', `EUR ${parsed.monthlyCostLimit}/月`);
  }

  if (typeof parsed.costLimitEnabled === 'boolean') {
    pushLine(lines, '费用断电', parsed.costLimitEnabled ? '开启' : '关闭');
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
  pushLine(lines, '跳过数量', parsed.skippedCount);
  pushLine(lines, '总数量', parsed.totalCount);
  pushLine(lines, '失败设备', parsed.failedDevices?.join('，'));
  pushLine(lines, '失败房间', parsed.failedRooms?.join('，'));
  pushLine(lines, '跳过房间', parsed.skippedRooms?.join('，'));
  pushLine(lines, '开始时间', formatDateTimeValue(parsed.startedAt));
  pushLine(lines, '恢复时间', formatDateTimeValue(parsed.recoveredAt));
  pushLine(lines, '持续时长', parsed.durationMinutes != null ? `${parsed.durationMinutes} 分钟` : null);
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
    return '系统';
  }

  if (parsed.username) {
    return String(parsed.username);
  }

  return null;
}

function inferActionLabel(
  type: OperationType,
  parsed: OperationDetailsPayload,
): string | null {
  switch (parsed.action) {
    case 'turn_on':
      return parsed.source === 'system_auto' ? '自动开电' : '手动开电';
    case 'turn_off':
      return parsed.source === 'system_auto' ? '自动断电' : '手动断电';
    case 'login_success':
      return '登录';
    case 'login_failed':
      return '登录失败';
    case 'logout':
      return '退出登录';
    case 'rename_device':
      return '修改空间名称';
    case 'update_room_annotation':
      return '修改房间备注';
    case 'bulk_device_control':
      return parsed.powerAction === 'on' ? '批量开启设备电源' : '批量关闭设备电源';
    case 'auto_restore_task_started':
      return '自动恢复任务开始';
    case 'auto_restore_task_completed':
      return '自动恢复任务完成';
    case 'auto_restore_task_failed':
      return '自动恢复任务失败';
    case 'auto_restore_task_skipped':
      return '自动恢复任务跳过';
    case 'auto_restore_task_checked':
      return '自动恢复任务检查';
    case 'auto_cutoff_skipped':
      return '自动断电跳过';
    case 'auto_restore_skipped':
      return '自动恢复供电跳过';
    case 'room_offline_detected':
      return '记录离线异常';
    case 'room_offline_recovered':
      return '记录离线恢复';
    case 'manual_cutoff':
      return '手动断电';
    case 'manual_restore':
      return '手动恢复供电';
    case 'auto_cutoff':
      return '自动断电';
    case 'auto_restore':
      return '自动恢复供电';
    default:
      return type === OperationType.control_device && parsed.powerAction
        ? parsed.powerAction === 'on'
          ? '开启设备电源'
          : '关闭设备电源'
        : null;
  }
}
