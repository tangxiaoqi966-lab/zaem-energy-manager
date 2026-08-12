import axios from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  ForcePasswordChangeRequest,
  UserPayload,
  UserCreateRequest,
  UserManagementItem,
  UserUpdateRequest,
  DashboardSummary,
  RealtimeEnergyData,
  RoomEnergyDetail,
  RankingItem,
  SystemSettingsData,
  DeviceItem,
} from '../types';
import { useAuthStore } from '../store/auth';
import { getApiBaseUrl } from './runtime-config';

const apiBaseUrl = getApiBaseUrl();

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let redirecting401 = false;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      const url: string | undefined = error.config?.url;
      const isAuthEndpoint =
        !!url && (url.includes('/auth/login') || url.includes('/auth/me'));
      if (!isAuthEndpoint) {
        try {
          await api.get('/auth/me');
          return api.request(error.config);
        } catch {
        }
      }
      if (!redirecting401) {
        redirecting401 = true;
        try {
          useAuthStore.getState().logout();
        } catch {
        }
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        setTimeout(() => {
          redirecting401 = false;
        }, 800);
      }
    }
    const serverMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '请求失败';
    return Promise.reject(new Error(serverMessage));
  }
);

export const auth = {
  login: (data: LoginRequest): Promise<LoginResponse> =>
    api.post('/auth/login', data).then((res) => res.data),
  forceChangePassword: (data: ForcePasswordChangeRequest): Promise<LoginResponse> =>
    api.post('/auth/force-change-password', data).then((res) => res.data),
  logout: (): void => {
    useAuthStore.getState().logout();
  },
  me: (): Promise<UserPayload> =>
    api.get('/auth/me').then((res) => res.data),
  listUsers: (): Promise<UserManagementItem[]> =>
    api.get('/auth/users').then((res) => res.data),
  createUser: (data: UserCreateRequest): Promise<UserManagementItem> =>
    api.post('/auth/users', data).then((res) => res.data),
  updateUser: (userId: string, data: UserUpdateRequest): Promise<UserManagementItem> =>
    api.put(`/auth/users/${userId}`, data).then((res) => res.data),
  deleteUser: (userId: string): Promise<{ ok: boolean }> =>
    api.delete(`/auth/users/${userId}`).then((res) => res.data),
};

export const dashboard = {
  get: (): Promise<DashboardSummary> =>
    api.get('/dashboard').then((res) => res.data),
};

export const energy = {
  getRooms: (): Promise<RealtimeEnergyData[]> =>
    api.get('/energy').then((res) => res.data),
  getRoom: (roomId: string): Promise<RoomEnergyDetail> =>
    api.get(`/energy/${roomId}`).then((res) => res.data),
  getLimits: (): Promise<any[]> =>
    api.get('/energy/limits').then((res) => res.data),
  updateLimit: (roomId: string, dailyLimit: number, enabled?: boolean): Promise<any> =>
    api.put(`/energy/limits/${roomId}`, { dailyLimit, enabled }).then((res) => res.data),
  bulkToggleLimits: (enabled: boolean): Promise<any> =>
    api.post('/energy/limits/bulk-toggle', { enabled }).then((res) => res.data),
  cutoff: (roomId: string): Promise<any> =>
    api.post(`/energy/${roomId}/cutoff`).then((res) => res.data),
  restore: (roomId: string): Promise<any> =>
    api.post(`/energy/${roomId}/restore`).then((res) => res.data),
  ranking: (limit?: number): Promise<RankingItem[]> =>
    api.get('/energy/stats/ranking', { params: limit ? { limit } : undefined }).then((res) => res.data),
};

export const system = {
  getSettings: (): Promise<SystemSettingsData> =>
    api.get('/system/settings').then((res) => res.data),
  updateSettings: (partial: Partial<SystemSettingsData>): Promise<any> =>
    api.put('/system/settings', partial).then((res) => res.data),
  xiaomiStatus: (): Promise<{
    loggedIn: boolean;
    hasEnvCredentials: boolean;
    username?: string;
    auth?: {
      state: 'idle' | 'logged_in' | 'challenge_required' | 'error';
      needsVerification: boolean;
      verificationMethod?: 'browser' | 'email_code' | null;
      message?: string;
      notificationUrl?: string;
      securityStatus?: number | null;
      pwd?: number | null;
      code?: number | string | null;
      location?: string | null;
      codeSentAt?: string | null;
      username?: string;
      lastAttemptAt?: string | null;
    };
  }> => api.get('/system/xiaomi/status').then((res) => res.data),
  xiaomiLogin: (
    username?: string,
    password?: string,
    sessionInput?: {
      userId?: string;
      serviceToken?: string;
      ssecurity?: string;
      region?: string;
    },
  ): Promise<{ loggedIn: boolean; usedEnv: boolean; loginMode?: 'password' | 'session' }> =>
    api
      .post('/system/xiaomi/login', {
        username: username || undefined,
        password: password || undefined,
        userId: sessionInput?.userId || undefined,
        serviceToken: sessionInput?.serviceToken || undefined,
        ssecurity: sessionInput?.ssecurity || undefined,
        region: sessionInput?.region || undefined,
      })
      .then((res) => res.data),
  xiaomiContinueLogin: (): Promise<{ loggedIn: boolean; usedEnv: boolean; loginMode?: 'password' | 'session' }> =>
    api.post('/system/xiaomi/login/continue', { continueAfterVerification: true }).then((res) => res.data),
  xiaomiSendEmailVerificationCode: (): Promise<{
    sent: boolean;
    usedEnv: boolean;
    loginMode?: 'password' | 'session';
    verificationMethod?: 'email_code';
  }> =>
    api.post('/system/xiaomi/login', { sendEmailVerificationCode: true }).then((res) => res.data),
  xiaomiVerifyEmailCode: (verificationCode: string): Promise<{
    loggedIn: boolean;
    usedEnv: boolean;
    loginMode?: 'password' | 'session';
    verificationMethod?: 'email_code';
  }> =>
    api.post('/system/xiaomi/login', { verificationCode }).then((res) => res.data),
  xiaomiSync: (): Promise<{ synced: boolean }> =>
    api.post('/system/xiaomi/sync').then((res) => res.data),
  controlAllDevices: (action: 'on' | 'off'): Promise<{ ok: boolean; action: 'on' | 'off'; total: number; success: number; failed: number }> =>
    api.post('/system/devices/control-all', { action }).then((res) => res.data),
  controlDevice: (did: string, action: 'on' | 'off'): Promise<{ ok: boolean; did: string; action: 'on' | 'off' }> =>
    api.post(`/system/device/${did}/control`, { action }).then((res) => res.data),
  updateRoomAnnotation: (
    roomId: string,
    annotation: string,
  ): Promise<{ roomId: string; roomNumber: string; annotation: string | null; displayName: string }> =>
    api.put(`/system/room/${roomId}/annotation`, { annotation }).then((res) => res.data),
  renameDevice: (did: string, name: string): Promise<{ did: string; name: string }> =>
    api.put(`/system/device/${did}/name`, { name }).then((res) => res.data),
};

export const logs = {
  operations: (params?: any): Promise<any> =>
    api.get('/logs/operations', { params }).then((res) => res.data),
  alarms: (params?: any): Promise<any> =>
    api.get('/logs/alarms', { params }).then((res) => res.data),
  clearAlarms: (data?: any): Promise<any> =>
    api.delete('/logs/alarms', { data }).then((res) => res.data),
  resolveAlarm: (id: string): Promise<any> =>
    api.post(`/logs/alarms/${id}/resolve`).then((res) => res.data),
};

export type { DeviceItem };
export default api;
