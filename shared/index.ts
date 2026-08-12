export enum UserRole {
  ADMIN = 'admin',
  BOSS = 'boss',
  USER = 'user',
}

export enum RoomStatus {
  NORMAL = 'normal',
  WARNING_80 = 'warning_80',
  WARNING_90 = 'warning_90',
  WARNING_95 = 'warning_95',
  CUTOFF = 'cutoff',
  OFFLINE = 'offline',
}

export enum AlarmType {
  LIMIT_80 = 'limit_80',
  LIMIT_90 = 'limit_90',
  LIMIT_95 = 'limit_95',
  LIMIT_REACHED = 'limit_reached',
  DEVICE_OFFLINE = 'device_offline',
  CONTROL_FAILED = 'control_failed',
  SYNC_FAILED = 'sync_failed',
}

export enum AlarmLevel {
  INFO = 'info',
  WARNING = 'warning',
  DANGER = 'danger',
  CRITICAL = 'critical',
}

export enum OperationType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  UPDATE_LIMIT = 'update_limit',
  CUTOFF_POWER = 'cutoff_power',
  RESTORE_POWER = 'restore_power',
  UPDATE_ALARM = 'update_alarm',
  UPDATE_SETTINGS = 'update_settings',
  SYNC_DEVICES = 'sync_devices',
  CONTROL_DEVICE = 'control_device',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  UNKNOWN = 'unknown',
}

export interface HourlyDataPoint {
  hour: number;
  usage: number;
  createdAt?: string;
}

export interface DailyDataPoint {
  date: string;
  usage: number;
  createdAt?: string;
}

export interface MonthlyDataPoint {
  year: number;
  month: number;
  usage: number;
  createdAt?: string;
}

export interface UserPayload {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  mustChangePassword?: boolean;
}

export interface UserManagementItem {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserCreateRequest {
  username: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface UserUpdateRequest {
  name?: string;
  password?: string;
  role?: UserRole;
}

export interface ForcePasswordChangeRequest {
  username: string;
  currentPassword: string;
  newUsername: string;
  newPassword: string;
  newName?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserPayload;
}

export interface RoomBasicInfo {
  id: string;
  roomNumber: string;
  name: string;
  floor: number;
}

export interface RealtimeEnergyData {
  roomId: string;
  roomNumber: string;
  displayName: string;
  roomAnnotation?: string | null;
  power: number;
  current: number;
  voltage: number;
  todayUsage: number;
  yesterdayUsage: number;
  monthUsage: number;
  yearUsage: number;
  status: RoomStatus;
  usagePercent: number;
  dailyLimit: number;
  limitEnabled: boolean;
  deviceOnline: boolean;
  cutoff: boolean;
  powerActionCooldownUntil: string | null;
  powerActionRetryAfterSeconds: number;
  powerActionLastType: 'cutoff_power' | 'restore_power' | null;
  devices: DeviceItem[];
}

export interface DeviceItem {
  id: string;
  did: string;
  name: string;
  model: string;
  status: DeviceStatus;
  roomId: string | null;
  roomNumber: string | null;
  power: boolean | null;
  powerW: number | null;
  currentA: number | null;
  voltageV: number | null;
  totalKwh: number | null;
  lastSyncAt: string | null;
}

export interface DashboardSummary {
  todayTotalUsage: number;
  estimatedCost: number;
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  alarmCount: number;
  roomData: RealtimeEnergyData[];
  devices: DeviceItem[];
}

export interface RoomEnergyDetail {
  realtime: RealtimeEnergyData;
  today24h: HourlyDataPoint[];
  last7Days: DailyDataPoint[];
  last30Days: DailyDataPoint[];
  last12Months: MonthlyDataPoint[];
  devices: DeviceItem[];
}

export interface EnergyLimitUpdate {
  roomId: string;
  dailyLimit: number;
  enabled?: boolean;
}

export interface RankingItem {
  roomId: string;
  roomNumber: string;
  displayName: string;
  roomAnnotation?: string | null;
  usage: number;
  rank: number;
}

export interface AlarmLogResponse {
  id: string;
  type: AlarmType;
  level: AlarmLevel;
  roomId: string | null;
  roomNumber: string | null;
  displayName?: string | null;
  message: string;
  createdAt: string;
  resolved: boolean;
}

export interface OperationLogResponse {
  id: string;
  type: OperationType;
  userId: string | null;
  username: string | null;
  actorLabel?: string | null;
  roomId: string | null;
  roomNumber: string | null;
  displayName?: string | null;
  details: string;
  detailsText?: string;
  success: boolean;
  createdAt: string;
}

export interface SystemSettingsData {
  alarmRatio80: number;
  alarmRatio90: number;
  alarmRatio95: number;
  autoCutoff: boolean;
  autoRestorePower: boolean;
  businessTimezone: string;
  refreshInterval: number;
  dailyResetHour: number;
  pricePerKwh: number;
}

export interface XiaomiDeviceInfo {
  did: string;
  name: string;
  model: string;
  online: boolean;
  roomId: string | null;
  power?: boolean;
  powerW?: number;
  currentA?: number;
  voltageV?: number;
  totalKwh?: number;
}

export const ROOM_COUNT = 14;
export const ROOM_NUMBERS = [
  '101', '102', '103', '104', '105', '106', '107',
  '108', '109', '110', '111', '112', '113', '114',
];

export const ROOM_STATUS_COLORS: Record<RoomStatus, string> = {
  [RoomStatus.NORMAL]: '#22c55e',
  [RoomStatus.WARNING_80]: '#eab308',
  [RoomStatus.WARNING_90]: '#f97316',
  [RoomStatus.WARNING_95]: '#ef4444',
  [RoomStatus.CUTOFF]: '#991b1b',
  [RoomStatus.OFFLINE]: '#6b7280',
};

export const ROOM_STATUS_TEXT: Record<RoomStatus, string> = {
  [RoomStatus.NORMAL]: '正常',
  [RoomStatus.WARNING_80]: '80%预警',
  [RoomStatus.WARNING_90]: '90%预警',
  [RoomStatus.WARNING_95]: '95%预警',
  [RoomStatus.CUTOFF]: '已断电',
  [RoomStatus.OFFLINE]: '离线',
};
