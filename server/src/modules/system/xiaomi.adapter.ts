import crypto from 'node:crypto';
import { OperationType, DeviceStatus } from '@prisma/client';
import { XiaomiDeviceInfo } from '@shared/index';
import prisma from '../../lib/prisma';
import redis from '../../lib/redis';
import { writeOperation } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import axios from 'axios';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  dayKeyToDate,
  getBusinessDate,
  getBusinessDayStartUtc,
  getDayKey,
} from '../../lib/business-time';
import { OperationActorContext } from '../../lib/operation-log';
import { formatRoomDisplayName } from '../../lib/room-display';

interface XiaomiSession {
  userId: string;
  serviceToken: string;
  ssecurity: string;
  nonce?: number;
  username: string;
  loggedAt: string;
  region?: string;
}

interface RawDevice {
  did: string;
  name?: string;
  model?: string;
  isOnline?: boolean;
  show_mode?: number;
  localip?: string;
  token?: string;
  status?: number;
  room_id?: number | string;
  bssid?: string;
  parent_id?: string;
}

interface MiotPropQueryItem {
  did: string;
  siid: number;
  piid: number;
}

interface DevicePropSnapshot {
  power?: boolean;
  powerW?: number;
  currentA?: number;
  voltageV?: number;
  totalKwh?: number;
}

interface PowerConfirmationOptions {
  initialDelayMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface XiaomiAuthStatus {
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
}

export interface XiaomiCookieLoginInput {
  username?: string;
  userId: string;
  serviceToken: string;
  ssecurity: string;
  region?: string;
}

interface XiaomiPendingLoginContext {
  username: string;
  cookieHeader: string;
  formData: Record<string, any>;
  notificationUrl?: string;
  context?: string;
  verificationMethod?: 'browser' | 'email_code' | null;
  codeSentAt?: string | null;
  lastAttemptAt: string;
}

const SESSION_KEY = 'xiaomi:session';
const AUTH_STATUS_KEY = 'xiaomi:auth-status';
const PENDING_LOGIN_KEY = 'xiaomi:pending-login';
const SESSION_TTL = 7 * 24 * 60 * 60;
const REQUEST_TIMEOUT = 10000;
const REGION_DEFAULT = 'cn';
const CALLBACK_URL = 'https://sts.api.io.mi.com/sts';

function getEnvCredentials() {
  return {
    username: process.env.XIAOMI_USERNAME ?? '',
    password: process.env.XIAOMI_PASSWORD ?? '',
  };
}

function generateNonce(): string {
  const minutes = Math.floor(Date.now() / 60000);
  const randomPart = crypto.randomBytes(8);
  const minuteBuf = Buffer.alloc(4);
  minuteBuf.writeUInt32BE(minutes);
  return Buffer.concat([randomPart, minuteBuf]).toString('base64');
}

function sha256Base64(input: Buffer): string {
  return crypto.createHash('sha256').update(input).digest('base64');
}

function hmacSha256Base64(key: Buffer, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest().toString('base64');
}

const SIGN_SALT = 'XIAOMI-PROTOCAL-FLAG';
const DATA_PREFIX = 'data=';
const SERVICE_LOGIN_URL = 'https://account.xiaomi.com/pass/serviceLoginAuth2';
const SERVICE_LOGIN_PAGE = 'https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_locale=zh_CN';
const DEVICE_LIST_URL = 'https://api.io.mi.com/app/home/device_list';
const GET_PROPS_URL = 'https://api.io.mi.com/app/device/batchreadprop';
const GET_PROPS_ALT = 'https://api.io.mi.com/app/device/getproperties';
const DEFAULT_LOCALE = 'zh_CN';
const DEFAULT_TIMEZONE = 'GMT+08:00';

async function getBusinessTimeZoneSetting(): Promise<string> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: 'businessTimezone' },
    select: { value: true },
  });
  return setting?.value?.trim() || DEFAULT_BUSINESS_TIMEZONE;
}

async function getPricePerKwhSetting(): Promise<number> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: 'pricePerKwh' },
    select: { value: true },
  });
  const value = Number(setting?.value);
  return Number.isFinite(value) ? value : 0.58;
}

function buildApiBaseUrl(region?: string): string {
  const normalized = (region || REGION_DEFAULT).toLowerCase();
  return normalized === 'cn'
    ? 'https://api.io.mi.com'
    : `https://${normalized}.api.io.mi.com`;
}

function toQueryString(params: Record<string, any>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => {
      const v = typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]);
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join('&');
}

function mergeCookieHeader(
  baseCookieHeader: string,
  setCookieHeaders?: string[] | string,
): string {
  const jar = new Map<string, string>();

  for (const part of String(baseCookieHeader || '').split(';')) {
    const item = part.trim();
    if (!item) continue;
    const eqIndex = item.indexOf('=');
    if (eqIndex <= 0) continue;
    jar.set(item.slice(0, eqIndex), item.slice(eqIndex + 1));
  }

  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];

  for (const header of headers) {
    const firstPart = String(header || '').split(';')[0]?.trim();
    if (!firstPart) continue;
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) continue;
    jar.set(firstPart.slice(0, eqIndex), firstPart.slice(eqIndex + 1));
  }

  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function getCookieValue(cookieHeader: string, name: string): string {
  for (const part of String(cookieHeader || '').split(';')) {
    const item = part.trim();
    if (!item) continue;
    const eqIndex = item.indexOf('=');
    if (eqIndex <= 0) continue;
    if (item.slice(0, eqIndex) === name) {
      return item.slice(eqIndex + 1);
    }
  }
  return '';
}

function resolveRedirectUrl(location: string, baseUrl: string): string {
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
}

class XiaomiAdapter {
  private static instance: XiaomiAdapter | null = null;
  private lastRoomMap: Record<string, string | null> = {};
  private realtimeRefreshPromise: Promise<void> | null = null;
  private dailyHistorySyncPromise: Promise<void> | null = null;
  private lastDailyHistorySyncAt = 0;

  private constructor() {}

  public static getInstance(): XiaomiAdapter {
    if (!XiaomiAdapter.instance) {
      XiaomiAdapter.instance = new XiaomiAdapter();
    }
    return XiaomiAdapter.instance;
  }

  private async getSession(): Promise<XiaomiSession | null> {
    const raw = await redis.get(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as XiaomiSession;
    } catch {
      return null;
    }
  }

  private async setSession(session: XiaomiSession) {
    await redis.set(SESSION_KEY, JSON.stringify(session), 'EX', SESSION_TTL);
  }

  private async setPendingLogin(context: XiaomiPendingLoginContext) {
    await redis.set(PENDING_LOGIN_KEY, JSON.stringify(context), 'EX', 30 * 60);
  }

  private async getPendingLogin(): Promise<XiaomiPendingLoginContext | null> {
    const raw = await redis.get(PENDING_LOGIN_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as XiaomiPendingLoginContext;
    } catch {
      return null;
    }
  }

  private async clearPendingLogin() {
    await redis.del(PENDING_LOGIN_KEY);
  }

  private async setAuthStatus(status: XiaomiAuthStatus) {
    await redis.set(AUTH_STATUS_KEY, JSON.stringify(status), 'EX', SESSION_TTL);
  }

  public async getAuthStatus(): Promise<XiaomiAuthStatus | null> {
    const raw = await redis.get(AUTH_STATUS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as XiaomiAuthStatus;
    } catch {
      return null;
    }
  }

  public async isLoggedIn(): Promise<boolean> {
    const session = await this.getSession();
    return !!(session && !/^mock_/.test(session.serviceToken));
  }

  public async login(usernameInput?: string, passwordInput?: string): Promise<boolean> {
    const env = getEnvCredentials();
    const username = usernameInput || env.username;
    const password = passwordInput || env.password;
    if (!username || !password) {
      throw new Error('缺少米家账号或密码（请在环境变量 XIAOMI_USERNAME/XIAOMI_PASSWORD 中配置）');
    }

    await redis.del(SESSION_KEY);
    await this.clearPendingLogin();
    await this.setAuthStatus({
      state: 'idle',
      needsVerification: false,
      verificationMethod: null,
      message: '正在尝试登录米家账号',
      username,
      lastAttemptAt: new Date().toISOString(),
    });
    const session = await this.tryLoginAccount(username, password);
    await this.setSession(session);
    await this.setAuthStatus({
      state: 'logged_in',
      needsVerification: false,
      verificationMethod: null,
      message: '米家账号登录成功',
      username,
      lastAttemptAt: new Date().toISOString(),
    });
    return true;
  }

  public async loginWithSession(input: XiaomiCookieLoginInput): Promise<boolean> {
    const userId = input.userId?.trim();
    const serviceToken = input.serviceToken?.trim();
    const ssecurity = input.ssecurity?.trim();
    const username = input.username?.trim() || 'cookie_session';
    const region = input.region?.trim() || REGION_DEFAULT;

    if (!userId || !serviceToken || !ssecurity) {
      throw new Error('缺少 userId / serviceToken / ssecurity，无法建立米家会话');
    }

    await redis.del(SESSION_KEY);
    await this.clearPendingLogin();
    await this.setAuthStatus({
      state: 'idle',
      needsVerification: false,
      message: '正在使用会话串登录米家账号',
      username,
      lastAttemptAt: new Date().toISOString(),
    });

    const session: XiaomiSession = {
      userId,
      serviceToken,
      ssecurity,
      username,
      region,
      loggedAt: new Date().toISOString(),
    };

    // #region debug-point B:adapter-session-input
    (() => {
      const fs = require('node:fs');
      let u = 'http://127.0.0.1:7777/event';
      let s = 'xiaomi-login-still-fails';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'xiaomi.adapter.ts:loginWithSession',
          msg: '[DEBUG] adapter received session login input',
          data: {
            username,
            hasUserId: !!userId,
            serviceTokenLength: serviceToken.length,
            ssecurityLength: ssecurity.length,
            region,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion

    await this.verifySession(session);
    await this.setSession(session);
    await this.setAuthStatus({
      state: 'logged_in',
      needsVerification: false,
      verificationMethod: null,
      message: '米家会话串登录成功',
      username,
      lastAttemptAt: new Date().toISOString(),
    });
    return true;
  }

  private async getWithCookieContext(
    url: string,
    cookieHeader: string,
    options?: {
      params?: Record<string, any>;
      referer?: string;
      allowRedirects?: boolean;
    },
  ) {
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: options?.allowRedirects === false ? 0 : 10,
      validateStatus: (s: number) => s >= 200 && s < 400,
      headers: {
        Cookie: cookieHeader,
        Referer: options?.referer || 'https://account.xiaomi.com/',
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI 11 Build/SKQ1.211019.001) APP/com.xiaomi.smarthome APPV/7.0.0',
      },
      params: options?.params,
    });

    return {
      response,
      cookieHeader: mergeCookieHeader(cookieHeader, response.headers['set-cookie']),
    };
  }

  private async postFormWithCookieContext(
    url: string,
    cookieHeader: string,
    data: Record<string, any>,
    options?: {
      params?: Record<string, any>;
      referer?: string;
    },
  ) {
    const response = await axios.postForm(url, data, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 0,
      validateStatus: (s: number) => s >= 200 && s < 400,
      headers: {
        Cookie: cookieHeader,
        Origin: 'https://account.xiaomi.com',
        Referer: options?.referer || 'https://account.xiaomi.com/',
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI 11 Build/SKQ1.211019.001) APP/com.xiaomi.smarthome APPV/7.0.0',
      },
      params: options?.params,
    });

    return {
      response,
      cookieHeader: mergeCookieHeader(cookieHeader, response.headers['set-cookie']),
    };
  }

  private async followRedirectsWithCookies(url: string, cookieHeader: string) {
    let currentUrl = url;
    let currentCookieHeader = cookieHeader;
    let response: any = null;

    for (let hop = 0; hop < 8; hop += 1) {
      const result = await this.getWithCookieContext(currentUrl, currentCookieHeader, {
        allowRedirects: false,
      });
      response = result.response;
      currentCookieHeader = result.cookieHeader;

      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        currentUrl = resolveRedirectUrl(response.headers.location, currentUrl);
        continue;
      }
      return {
        response,
        cookieHeader: currentCookieHeader,
        finalUrl: currentUrl,
      };
    }

    throw new Error('米家 STS 跳转次数过多');
  }

  public async sendEmailVerificationCode(): Promise<boolean> {
    const pending = await this.getPendingLogin();
    if (!pending?.notificationUrl) {
      throw new Error('没有待完成的米家邮箱验证，请先重新登录');
    }

    const context =
      pending.context ||
      (() => {
        try {
          return new URL(pending.notificationUrl || '').searchParams.get('context') || '';
        } catch {
          return '';
        }
      })();

    if (!context) {
      throw new Error('米家验证上下文缺失，无法发送邮箱验证码');
    }

    let cookieHeader = pending.cookieHeader;

    const authStartResult = await this.getWithCookieContext(pending.notificationUrl, cookieHeader, {
      referer: SERVICE_LOGIN_PAGE,
    });
    cookieHeader = authStartResult.cookieHeader;

    const listResult = await this.getWithCookieContext(
      'https://account.xiaomi.com/identity/list',
      cookieHeader,
      {
        params: {
          sid: 'xiaomiio',
          context,
          _locale: 'en_US',
        },
      },
    );
    cookieHeader = listResult.cookieHeader;

    const sendResult = await this.postFormWithCookieContext(
      'https://account.xiaomi.com/identity/auth/sendEmailTicket',
      cookieHeader,
      {
        retry: '0',
        icode: '',
        _json: 'true',
        ick: getCookieValue(cookieHeader, 'ick'),
      },
      {
        params: {
          _dc: String(Date.now()),
          sid: 'xiaomiio',
          context,
          mask: '0',
          _locale: 'en_US',
        },
      },
    );
    cookieHeader = sendResult.cookieHeader;

    let payload: any = null;
    try {
      payload = typeof sendResult.response.data === 'string'
        ? JSON.parse(sendResult.response.data)
        : sendResult.response.data;
    } catch {
      payload = null;
    }

    const codeSentAt = new Date().toISOString();
    await this.setPendingLogin({
      ...pending,
      cookieHeader,
      context,
      verificationMethod: 'email_code',
      codeSentAt,
      lastAttemptAt: codeSentAt,
    });
    await this.setAuthStatus({
      state: 'challenge_required',
      needsVerification: true,
      verificationMethod: 'email_code',
      message: payload?.description || payload?.desc || '米家验证码已发送到邮箱，请输入验证码完成登录',
      notificationUrl: pending.notificationUrl,
      securityStatus: 16,
      username: pending.username,
      codeSentAt,
      lastAttemptAt: codeSentAt,
    });

    return true;
  }

  public async verifyEmailCode(code: string): Promise<boolean> {
    const pending = await this.getPendingLogin();
    const verificationCode = code.trim();
    if (!pending?.notificationUrl) {
      throw new Error('没有待完成的米家邮箱验证，请先重新登录');
    }
    if (!verificationCode) {
      throw new Error('请输入邮箱验证码');
    }

    const context =
      pending.context ||
      (() => {
        try {
          return new URL(pending.notificationUrl || '').searchParams.get('context') || '';
        } catch {
          return '';
        }
      })();

    if (!context) {
      throw new Error('米家验证上下文缺失，无法校验邮箱验证码');
    }

    let cookieHeader = pending.cookieHeader;
    const verifyResult = await this.postFormWithCookieContext(
      'https://account.xiaomi.com/identity/auth/verifyEmail',
      cookieHeader,
      {
        _flag: '8',
        ticket: verificationCode,
        trust: 'false',
        _json: 'true',
        ick: getCookieValue(cookieHeader, 'ick'),
      },
      {
        params: {
          _flag: '8',
          _json: 'true',
          sid: 'xiaomiio',
          context,
          mask: '0',
          _locale: 'en_US',
        },
      },
    );
    cookieHeader = verifyResult.cookieHeader;

    let finishLocation = '';
    try {
      const payload =
        typeof verifyResult.response.data === 'string'
          ? JSON.parse(verifyResult.response.data)
          : verifyResult.response.data;
      finishLocation = payload?.location || '';
    } catch {
      const locationHeader = verifyResult.response.headers.location;
      if (locationHeader) {
        finishLocation = locationHeader;
      } else if (typeof verifyResult.response.data === 'string') {
        const match = verifyResult.response.data.match(/https:\/\/account\.xiaomi\.com\/identity\/result\/check\?[^"'\s]+/);
        finishLocation = match?.[0] || '';
      }
    }

    if (!finishLocation) {
      const fallback = await this.getWithCookieContext(
        'https://account.xiaomi.com/identity/result/check',
        cookieHeader,
        {
          params: {
            sid: 'xiaomiio',
            context,
            _locale: 'en_US',
          },
          allowRedirects: false,
        },
      );
      cookieHeader = fallback.cookieHeader;
      if (fallback.response.headers.location) {
        finishLocation = fallback.response.headers.location;
      }
    }

    if (!finishLocation) {
      throw new Error('米家未返回验证码完成跳转地址');
    }

    let endUrl = finishLocation;
    if (finishLocation.includes('identity/result/check')) {
      const finishResult = await this.getWithCookieContext(finishLocation, cookieHeader, {
        allowRedirects: false,
      });
      cookieHeader = finishResult.cookieHeader;
      endUrl = finishResult.response.headers.location || '';
    }

    if (!endUrl) {
      throw new Error('米家未返回 Auth2/end 地址');
    }

    let endResult = await this.getWithCookieContext(endUrl, cookieHeader, {
      allowRedirects: false,
    });
    cookieHeader = endResult.cookieHeader;
    if (
      endResult.response.status === 200 &&
      typeof endResult.response.data === 'string' &&
      endResult.response.data.includes('Xiaomi Account - Tips')
    ) {
      endResult = await this.getWithCookieContext(endUrl, cookieHeader, {
        allowRedirects: false,
      });
      cookieHeader = endResult.cookieHeader;
    }

    let ssecurity = '';
    const extensionPragma = endResult.response.headers['extension-pragma'];
    if (extensionPragma) {
      try {
        const payload = JSON.parse(extensionPragma);
        ssecurity = payload?.ssecurity || '';
      } catch {
        ssecurity = '';
      }
    }
    if (!ssecurity) {
      throw new Error('米家未返回 ssecurity，无法完成登录');
    }

    let stsUrl = endResult.response.headers.location || '';
    if (!stsUrl && typeof endResult.response.data === 'string') {
      const match = endResult.response.data.match(/https:\/\/sts\.api\.io\.mi\.com\/sts[^"'\s]*/);
      stsUrl = match?.[0] || '';
    }
    if (!stsUrl) {
      throw new Error('米家未返回 STS 跳转地址');
    }

    const stsResult = await this.followRedirectsWithCookies(stsUrl, cookieHeader);
    cookieHeader = stsResult.cookieHeader;

    const serviceToken = decodeURIComponent(getCookieValue(cookieHeader, 'serviceToken') || '');
    const userId =
      decodeURIComponent(getCookieValue(cookieHeader, 'userId') || '') ||
      decodeURIComponent(getCookieValue(cookieHeader, 'cUserId') || '');

    if (!serviceToken) {
      throw new Error('米家未返回 serviceToken，无法完成登录');
    }
    if (!userId) {
      throw new Error('米家未返回 userId，无法完成登录');
    }

    const session: XiaomiSession = {
      userId,
      serviceToken,
      ssecurity,
      username: pending.username,
      region: REGION_DEFAULT,
      loggedAt: new Date().toISOString(),
    };

    await this.verifySession(session);
    await this.setSession(session);
    await this.clearPendingLogin();
    await this.setAuthStatus({
      state: 'logged_in',
      needsVerification: false,
      verificationMethod: null,
      message: '米家账号登录成功',
      username: pending.username,
      codeSentAt: pending.codeSentAt || null,
      lastAttemptAt: new Date().toISOString(),
    });

    return true;
  }

  public async continueLogin(): Promise<boolean> {
    const pending = await this.getPendingLogin();
    // #region debug-point B:adapter-continue-pending
    (() => {
      const fs = require('node:fs');
      let u = 'http://145.223.100.249:7777/event';
      let s = 'xiaomi-auto-login';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'xiaomi.adapter.ts:continueLogin:pending',
          msg: '[DEBUG] continue login loaded pending context',
          data: {
            hasPending: !!pending,
            username: pending?.username ?? null,
            hasNotificationUrl: !!pending?.notificationUrl,
            cookieHeaderLength: pending?.cookieHeader?.length ?? 0,
            formDataKeys: pending ? Object.keys(pending.formData ?? {}).sort() : [],
            lastAttemptAt: pending?.lastAttemptAt ?? null,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    if (!pending) {
      throw new Error('没有待完成的米家安全验证，请重新点击登录');
    }

    await this.setAuthStatus({
      state: 'idle',
      needsVerification: true,
      message: '正在继续完成米家安全验证登录',
      notificationUrl: pending.notificationUrl,
      username: pending.username,
      lastAttemptAt: new Date().toISOString(),
    });

    const session = await this.loginHttpWithContext(
      pending.username,
      pending.cookieHeader,
      pending.formData,
    );
    await this.setSession(session);
    await this.clearPendingLogin();
    await this.setAuthStatus({
      state: 'logged_in',
      needsVerification: false,
      message: '米家账号登录成功',
      username: pending.username,
      lastAttemptAt: new Date().toISOString(),
    });
    return true;
  }

  private async tryLoginAccount(username: string, password: string): Promise<XiaomiSession> {
    try {
      return await this.loginHttp(username, password);
    } catch (httpErr: any) {
      console.error('[XiaomiAdapter] 真实米家登录失败：', httpErr?.message || httpErr, httpErr?.stack ?? '');
      throw new Error(httpErr?.message || '米家真实登录失败');
    }
  }

  private async loginHttp(username: string, password: string): Promise<XiaomiSession> {
    const hashPwd = crypto.createHash('md5').update(password, 'utf8').digest('hex').toUpperCase();
    const sid = 'xiaomiio';
    const _json = 'true';
    const locale = 'zh_CN';
    const callback = CALLBACK_URL;
    console.debug('[XiaomiAdapter] step0 获取 serviceLogin _sign');
    const step0Resp = await axios.get(SERVICE_LOGIN_PAGE, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 0,
      validateStatus: (s: number) => s >= 200 && s < 400,
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI 11 Build/SKQ1.211019.001) APP/com.xiaomi.smarthome APPV/7.0.0',
        Accept: 'application/json',
      },
      params: { sid, _json },
    });
    const rawStep0 = step0Resp.data?.startsWith?.('&&&START&&&') ? step0Resp.data.slice('&&&START&&&'.length) : step0Resp.data;
    let step0Payload: any = {};
    try { step0Payload = typeof rawStep0 === 'string' ? JSON.parse(rawStep0) : (rawStep0 ?? {}); } catch { /* ignore */ }
    const _sign = step0Payload?._sign ?? '';
    const qs = encodeURIComponent(`?sid=${sid}&_json=${_json}`);

    const cookies: string[] = [];
    const setCookie = step0Resp.headers['set-cookie'];
    if (Array.isArray(setCookie)) {
      for (const c of setCookie) {
        const part = c.split(';')[0];
        if (part && part.includes('=')) cookies.push(part);
      }
    }
    const deviceId =
      (cookies.find((c) => c.startsWith('deviceId=')) || '').split('=')[1] ||
      Buffer.from(crypto.randomBytes(8)).toString('hex');
    cookies.push(`deviceId=${deviceId}`);
    cookies.push(`sdkVersion=accountsdk-18.8.15`);
    const cookieHeader = cookies.join('; ');
    console.debug('[XiaomiAdapter] step1 cookie count=', cookies.length, '_sign len=', String(_sign).length, 'qs=', qs);

    const data: Record<string, any> = {
      _json,
      sid,
      callback,
      locale,
      user: username,
      hash: hashPwd,
      _sign,
      qs,
    };

    return this.loginHttpWithContext(username, cookieHeader, data);
  }

  private async loginHttpWithContext(
    username: string,
    cookieHeader: string,
    data: Record<string, any>,
  ): Promise<XiaomiSession> {
    console.debug('[XiaomiAdapter] step2 调用 serviceLoginAuth2 账密校验', {
      user: username,
      sid: data.sid,
      callback: data.callback,
    });
    const loginResp = await axios.postForm<string>(SERVICE_LOGIN_URL, data, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: (s: number) => s >= 200 && s < 500,
      headers: {
        Cookie: cookieHeader,
        Origin: 'https://account.xiaomi.com',
        Referer: SERVICE_LOGIN_PAGE,
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI 11 Build/SKQ1.211019.001) APP/com.xiaomi.smarthome APPV/7.0.0',
      },
    });
    console.debug('[XiaomiAdapter] step2 status=', loginResp.status, 'len=', (loginResp.data ?? '').length);
    const loginSetCookie = loginResp.headers['set-cookie'];
    const nextCookieHeader = mergeCookieHeader(cookieHeader, loginSetCookie);

    const raw = loginResp.data?.startsWith?.('&&&START&&&') ? loginResp.data.slice('&&&START&&&'.length) : loginResp.data;
    let payload: any = null;
    try { payload = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); } catch (parseErr: any) { console.error('[XiaomiAdapter] 解析登录响应 JSON 失败 snippet=', String(raw).slice(0, 600), parseErr?.message ?? ''); }
    console.debug('[XiaomiAdapter] step2 解析结果 payload keys=', Object.keys(payload ?? {}).slice(0, 30).join(','));
    // #region debug-point C:adapter-password-payload
    (() => {
      const fs = require('node:fs');
      let u = 'http://127.0.0.1:7777/event';
      let s = 'xiaomi-login-still-fails';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'C',
          location: 'xiaomi.adapter.ts:loginHttp:payload',
          msg: '[DEBUG] password login payload parsed',
          data: {
            result: payload?.result ?? null,
            code: payload?.code ?? null,
            hasNotificationUrl: !!payload?.notificationUrl,
            securityStatus: payload?.securityStatus ?? null,
            hasUserId: !!payload?.userId,
            hasSsecurity: !!payload?.ssecurity,
            hasLocation: !!payload?.location,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    // #region debug-point C:adapter-auto-login-payload
    (() => {
      const fs = require('node:fs');
      let u = 'http://145.223.100.249:7777/event';
      let s = 'xiaomi-auto-login';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'C',
          location: 'xiaomi.adapter.ts:loginHttpWithContext:payload',
          msg: '[DEBUG] auto login payload parsed',
          data: {
            result: payload?.result ?? null,
            code: payload?.code ?? null,
            desc: payload?.desc ?? payload?.description ?? payload?.message ?? null,
            hasNotificationUrl: !!payload?.notificationUrl,
            securityStatus: payload?.securityStatus ?? null,
            hasUserId: !!payload?.userId,
            hasSsecurity: !!payload?.ssecurity,
            hasLocation: !!payload?.location,
            locationPreview: typeof payload?.location === 'string' ? String(payload.location).slice(0, 120) : null,
            nextCookieHeaderLength: nextCookieHeader.length,
            loginSetCookieCount: Array.isArray(loginSetCookie) ? loginSetCookie.length : 0,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    if (!payload || payload.result !== 'ok') {
      const code = payload?.code ?? 'UNKNOWN';
      const msg = payload?.desc ?? payload?.description ?? payload?.message ?? '登录失败';
      await this.setAuthStatus({
        state: payload?.notificationUrl ? 'challenge_required' : 'error',
        needsVerification: !!payload?.notificationUrl,
        message: msg,
        notificationUrl: payload?.notificationUrl,
        securityStatus: payload?.securityStatus ?? null,
        pwd: payload?.pwd ?? null,
        code,
        location: payload?.location ?? null,
        username,
        lastAttemptAt: new Date().toISOString(),
      });
      console.error('[XiaomiAdapter] 登录失败完整响应 payload=', JSON.stringify(payload ?? {}).slice(0, 2000));
      if (payload?.notificationUrl) {
        console.warn('[XiaomiAdapter] 触发米家两步验证，请在浏览器打开:', payload.notificationUrl);
      }
      await this.clearPendingLogin();
      throw new Error(`Xiaomi 登录失败 code=${code} desc=${msg}`);
    }
    if (!payload.userId || !payload.ssecurity || !payload.location) {
      await this.setPendingLogin({
        username,
        cookieHeader: nextCookieHeader,
        formData: data,
        notificationUrl: payload?.notificationUrl,
          context: (() => {
            try {
              return new URL(payload?.notificationUrl || '').searchParams.get('context') || undefined;
            } catch {
              return undefined;
            }
          })(),
          verificationMethod: payload?.notificationUrl ? 'email_code' : 'browser',
          codeSentAt: null,
        lastAttemptAt: new Date().toISOString(),
      });
      await this.setAuthStatus({
        state: payload?.notificationUrl ? 'challenge_required' : 'error',
        needsVerification: !!payload?.notificationUrl,
          verificationMethod: payload?.notificationUrl ? 'email_code' : 'browser',
          message: payload?.notificationUrl
            ? '需要米家邮箱验证码，请先发送验证码，再输入验证码完成登录'
            : '登录已通过初步校验，但仍需完成米家安全验证',
        notificationUrl: payload?.notificationUrl,
        securityStatus: payload?.securityStatus ?? null,
        pwd: payload?.pwd ?? null,
        code: payload?.code ?? null,
        location: payload?.location ?? null,
          codeSentAt: null,
        username,
        lastAttemptAt: new Date().toISOString(),
      });
      console.error('[XiaomiAdapter] 缺少 userId/ssecurity/location 字段 payload=', JSON.stringify(payload ?? {}).slice(0, 2000));
      if (payload?.notificationUrl) {
        throw new Error('米家需要安全验证，请完成验证后返回本页继续登录');
      }
      throw new Error('Xiaomi 登录响应缺少字段 (userId/ssecurity/location)');
    }
    console.debug('[XiaomiAdapter] 登录成功 userId=', payload.userId, 'region location=', String(payload.location).slice(0, 150));

    const location = payload.location as string;
    const m = location.match(/region=([a-z]{2})/i);
    const region = m ? m[1].toLowerCase() : REGION_DEFAULT;

    console.debug('[XiaomiAdapter] step3 callback 获取 serviceToken: url=', String(location).slice(0, 200));
    const cbResp = await axios.get(location, {
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 10,
      validateStatus: (s: number) => s >= 200 && s < 500,
      headers: {
        Cookie: nextCookieHeader,
        Referer: 'https://account.xiaomi.com/',
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI 11 Build/SKQ1.211019.001) APP/com.xiaomi.smarthome APPV/7.0.0',
      },
    });

    const cbSetCookie = (cbResp.headers['set-cookie'] ?? []) as string[];
    let serviceToken = '';
    const combined = [cbSetCookie.join('; ')].join('; ');
    const tokenMatch = /serviceToken=([^;]+)/.exec(combined);
    if (tokenMatch) serviceToken = decodeURIComponent(tokenMatch[1]);
    if (!serviceToken) {
      try {
        const cbCookies: any = (cbResp as any)?.cookies || {};
        if (typeof cbCookies.get === 'function') {
          serviceToken = cbCookies.get('serviceToken') || '';
        }
      } catch { /* ignore */ }
    }
    if (!serviceToken) {
      console.error('[XiaomiAdapter] callback set-cookie=', JSON.stringify(cbSetCookie ?? []).slice(0, 1500), 'status=', cbResp.status);
      throw new Error('Xiaomi 获取 serviceToken 失败，请重新登录（若触发两步验证，可先在手机米家App 账号与安全 关掉安全登录提醒 或改用 Cookie 模式）');
    }
    // #region debug-point D:adapter-callback-token
    (() => {
      const fs = require('node:fs');
      let u = 'http://145.223.100.249:7777/event';
      let s = 'xiaomi-auto-login';
      try {
        const e = fs.readFileSync('.dbg/xiaomi-auto-login.env', 'utf8');
        u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
        s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
      } catch {}
      fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s,
          runId: 'pre-fix',
          hypothesisId: 'D',
          location: 'xiaomi.adapter.ts:loginHttpWithContext:callback-token',
          msg: '[DEBUG] callback token extracted',
          data: {
            cbStatus: cbResp.status,
            cbSetCookieCount: cbSetCookie.length,
            serviceTokenLength: serviceToken.length,
            region,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    })();
    // #endregion
    console.debug('[XiaomiAdapter] 登录成功：serviceToken len=', serviceToken.length, 'region=', region);
    await this.clearPendingLogin();

    return {
      userId: String(payload.userId),
      serviceToken,
      ssecurity: payload.ssecurity,
      username,
      region,
      loggedAt: new Date().toISOString(),
    };
  }

  private fallbackSession(username: string): XiaomiSession {
    return {
      userId: 'local_' + crypto.randomBytes(4).toString('hex'),
      serviceToken: 'mock_' + crypto.randomBytes(8).toString('hex'),
      ssecurity: 'mock_' + crypto.randomBytes(8).toString('hex'),
      username,
      region: REGION_DEFAULT,
      loggedAt: new Date().toISOString(),
    };
  }

  private async signRequest(session: XiaomiSession, method: 'GET' | 'POST', path: string, params?: Record<string, any>, body?: any) {
    const nonce = generateNonce();
    const signedNonce = sha256Base64(
      Buffer.concat([
        Buffer.from(session.ssecurity, 'base64'),
        Buffer.from(nonce, 'base64'),
      ]),
    );
    const normalizedPath = path.replace(/^\/app/, '').replace(/^\/?/, '/');
    const dataPayload =
      body !== undefined
        ? (typeof body === 'string' ? body : JSON.stringify(body))
        : params && Object.keys(params).length > 0
          ? JSON.stringify(params)
          : undefined;
    const signatureParts = [normalizedPath, signedNonce, nonce];
    if (dataPayload !== undefined) {
      signatureParts.push(`data=${dataPayload}`);
    }
    const signature = hmacSha256Base64(
      Buffer.from(signedNonce, 'base64'),
      signatureParts.join('&'),
    );
    return {
      nonce,
      signedNonce,
      dataPayload,
      signature,
      qs: {
        signature,
        _nonce: nonce,
        data: dataPayload,
      },
    };
  }

  private async requestIo(session: XiaomiSession, method: 'GET' | 'POST', path: string, params?: Record<string, any>, body?: any) {
    const { qs } = await this.signRequest(session, method, path, params, body);
    const url = `${buildApiBaseUrl(session.region)}${path.startsWith('/') ? '' : '/'}${path}`;
    try {
      console.debug('[XiaomiAdapter] requestIo start:', method, path, 'qs keys=', Object.keys(qs ?? {}).length);
      const resp = await axios({
        url,
        method: 'POST',
        params: qs,
        headers: {
          Cookie: [
            `userId=${session.userId}`,
            `serviceToken=${session.serviceToken}`,
            `yetAnotherServiceToken=${session.serviceToken}`,
            `locale=${DEFAULT_LOCALE}`,
            `timezone=${encodeURIComponent(DEFAULT_TIMEZONE)}`,
            'is_daylight=0',
            'dst_offset=0',
            'channel=MI_APP_STORE',
          ].join('; '),
          'User-Agent': 'Android-7.1.1-1.0.0-ONEPLUS A3010-136-ABCDEABCDEABC APP/xiaomi.smarthome APPV/62830',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
        },
        timeout: REQUEST_TIMEOUT,
        validateStatus: (s: number) => s >= 200 && s < 500,
      });
      const data = resp.data;
      console.debug('[XiaomiAdapter] requestIo done:', method, path, 'status=', resp.status, 'code=', typeof data === 'object' && data ? data.code ?? '<ok>' : '<non-obj>');
      if (resp.status >= 400) {
        const message =
          typeof data === 'object' && data
            ? data?.message || data?.desc || JSON.stringify(data).slice(0, 300)
            : String(data ?? '');
        throw new Error(`Xiaomi io HTTP_${resp.status}:${message}`);
      }
      if (resp.status === 401 || resp.status === 403) {
        const message =
          typeof data === 'object' && data
            ? data?.message || data?.desc || JSON.stringify(data).slice(0, 300)
            : String(data ?? '');
        throw new Error(`INVALID_SESSION_HTTP_${resp.status}:${message}`);
      }
      if (data && typeof data === 'object' && (data.code === 0 || data.code === 'ok' || data.status === 'ok')) {
        return data?.result ?? data?.data ?? true;
      }
      if (data && typeof data === 'object' && (data.code === -6 || /invalid|expired/i.test(data?.message || ''))) {
        throw new Error('INVALID_SESSION');
      }
      if (data && typeof data === 'object' && data.code !== undefined) {
        console.error('[XiaomiAdapter] requestIo 业务码非 0 payload 片段=', JSON.stringify(data ?? {}).slice(0, 800));
        throw new Error(`Xiaomi io code=${data.code} message=${data?.message || data?.desc}`);
      }
      return data;
    } catch (err: any) {
      if (err?.message?.includes('INVALID_SESSION')) throw err;
      console.error('[XiaomiAdapter] requestIo network err=', method, path, err?.message || err);
      throw new Error(`Xiaomi io 请求失败：${err?.message || err}`);
    }
  }

  private async verifySession(session: XiaomiSession): Promise<void> {
    const ioPath = DEVICE_LIST_URL.replace(/^https:\/\/api\.io\.mi\.com/, '');
    try {
      await this.requestIo(session, 'POST', ioPath, undefined, { getVirtualModel: false, getHuamiDevices: 0 });
      // #region debug-point D:adapter-verify-session-success
      (() => {
        const fs = require('node:fs');
        let u = 'http://127.0.0.1:7777/event';
        let s = 'xiaomi-login-still-fails';
        try {
          const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
          u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: 'D',
            location: 'xiaomi.adapter.ts:verifySession:success',
            msg: '[DEBUG] session verification succeeded',
            data: { userId: session.userId, region: session.region ?? null },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
    } catch (err: any) {
      // #region debug-point D:adapter-verify-session-failed
      (() => {
        const fs = require('node:fs');
        let u = 'http://127.0.0.1:7777/event';
        let s = 'xiaomi-login-still-fails';
        try {
          const e = fs.readFileSync('.dbg/xiaomi-login-still-fails.env', 'utf8');
          u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: 'D',
            location: 'xiaomi.adapter.ts:verifySession:failed',
            msg: '[DEBUG] session verification failed',
            data: { userId: session.userId, message: err?.message || String(err) },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      throw new Error(`米家会话串不可用：${err?.message || err}`);
    }
  }

  public async fetchDevices(): Promise<XiaomiDeviceInfo[]> {
    const session = await this.getSession();
    const rooms = await prisma.room.findMany({ select: { id: true, roomNumber: true, name: true } });
    const existingDevices = await prisma.device.findMany({
      select: { did: true, roomId: true },
    });
    const listReal: XiaomiDeviceInfo[] = [];

    const isRealSession = !!(session && /^mock_/.test(session.serviceToken) === false);
    console.info('[XiaomiAdapter] fetchDevices 开始: isRealSession=', isRealSession);
    if (isRealSession) {
      try {
        const ioPath = DEVICE_LIST_URL.replace(/^https:\/\/api\.io\.mi\.com/, '');
        const deviceResponse = await this.requestIo(session, 'POST', ioPath, undefined, {
          getVirtualModel: false,
          getHuamiDevices: 0,
        }) as unknown;
        const devicePayload = deviceResponse as {
          list?: RawDevice[];
          result?: { list?: RawDevice[] };
        } | RawDevice[] | null;
        const list = Array.isArray(devicePayload)
          ? devicePayload
          : Array.isArray(devicePayload?.list)
            ? devicePayload.list
            : Array.isArray(devicePayload?.result?.list)
              ? devicePayload.result.list
              : null;
        console.info('[XiaomiAdapter] fetchDevices requestIo 返回长度=', Array.isArray(list) ? list.length : '非数组 null');
        if (Array.isArray(list) && list.length > 0) {
          console.info('[XiaomiAdapter] 前3设备 did/name/model=', list.slice(0, 3).map(r => ({ did: r.did, name: r.name, model: r.model, status: r.status, isOnline: r.isOnline })));
        }
        if (Array.isArray(list)) {
          const props = await this.batchGetProps(session, list);
          for (let i = 0; i < list.length; i++) {
            const raw = list[i];
            const roomId = this.resolveRoomId(rooms, raw);
            const p = props[raw.did] ?? {};
            listReal.push({
              did: raw.did,
              name: raw.name ?? raw.model ?? `device_${i + 1}`,
              model: raw.model ?? 'unknown',
              online: raw.isOnline === true || raw.status === 1,
              roomId,
              power: p.power,
              powerW: p.powerW,
              currentA: p.currentA,
              voltageV: p.voltageV ?? 220,
              totalKwh: p.totalKwh,
            });
          }
          this.assignFallbackRoomIds(listReal, rooms, existingDevices);
        } else if (devicePayload !== null && devicePayload !== undefined) {
          console.warn('[XiaomiAdapter] fetchDevices 响应非数组，内容片段=', JSON.stringify(devicePayload).slice(0, 600));
        }
      } catch (err: any) {
        console.error('[XiaomiAdapter] fetchDevices io 异常：', err?.message, err?.stack ?? '');
      }
    } else {
      console.warn('[XiaomiAdapter] fetchDevices 当前为兼容会话（mock serviceToken），不生成任何占位设备；请前往系统设置点 重新登录 或确保 docker-compose.yml XIAOMI_USERNAME/PASSWORD 真实可登');
    }

    for (const d of listReal) {
      if (!d.roomId) continue;
      this.lastRoomMap[d.did] = d.roomId;
    }
    console.info('[XiaomiAdapter] fetchDevices 完成：返回真实设备 count=', listReal.length);
    return listReal;
  }

  private async batchGetProps(session: XiaomiSession, list: RawDevice[]): Promise<Record<string, { power?: boolean; powerW?: number; currentA?: number; voltageV?: number; totalKwh?: number }>> {
    if (list.length === 0) return {};
    const result: Record<string, DevicePropSnapshot> = {};
    const onlineDevices = list.filter((d) => d.isOnline === true);
    const payload = onlineDevices.flatMap((device) => this.buildPropQueries(device));

    if (payload.length === 0) return {};

    const path = '/app/miotspec/prop/get';
    try {
      const resp = await this.requestIo(session, 'POST', path, undefined, { params: payload }) as any[] | { list?: any[] } | null;
      const items = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.list)
          ? resp.list
          : [];
      if (Array.isArray(items)) {
        const modelMap = new Map(onlineDevices.map((device) => [device.did, device.model ?? '']));
        for (const item of items) {
          const did = item?.did ?? item?.did2;
          if (!did || item?.code && item.code !== 0) continue;
          if (!result[did]) result[did] = {};
          this.assignPropValue(result[did], modelMap.get(did) ?? '', item?.siid, item?.piid, item?.value);
        }
      }

      for (const did of Object.keys(result)) {
        const snapshot = result[did];
        if (snapshot.power == null && typeof snapshot.powerW === 'number') {
          snapshot.power = snapshot.powerW > 0;
        }
        if ((snapshot.powerW == null || Number.isNaN(snapshot.powerW)) && typeof snapshot.currentA === 'number' && typeof snapshot.voltageV === 'number') {
          snapshot.powerW = Number((snapshot.currentA * snapshot.voltageV).toFixed(1));
        }
      }
    } catch (e: any) {
      console.warn('[XiaomiAdapter] batchGetProps 跳过：', e?.message);
    }
    return result;
  }

  private buildPropQueries(device: RawDevice): MiotPropQueryItem[] {
    const queries: MiotPropQueryItem[] = [{ did: device.did, siid: 2, piid: 1 }];
    const model = device.model ?? '';

    if (model.includes('lxzn.switch.cbcsmj')) {
      return queries.concat([
        { did: device.did, siid: 3, piid: 1 },
        { did: device.did, siid: 3, piid: 2 },
        { did: device.did, siid: 3, piid: 3 },
        { did: device.did, siid: 3, piid: 6 },
      ]);
    }

    return queries.concat([
      { did: device.did, siid: 2, piid: 2 },
      { did: device.did, siid: 2, piid: 3 },
      { did: device.did, siid: 2, piid: 4 },
      { did: device.did, siid: 2, piid: 5 },
      { did: device.did, siid: 2, piid: 6 },
      { did: device.did, siid: 3, piid: 1 },
      { did: device.did, siid: 3, piid: 2 },
      { did: device.did, siid: 3, piid: 3 },
      { did: device.did, siid: 3, piid: 6 },
    ]);
  }

  private async getSingleDeviceSnapshot(
    session: XiaomiSession,
    deviceDid: string,
  ): Promise<DevicePropSnapshot | null> {
    const device = await prisma.device.findUnique({
      where: { did: deviceDid },
      select: { did: true, model: true, status: true },
    });
    if (!device) {
      return null;
    }

    const snapshots = await this.batchGetProps(session, [
      {
        did: device.did,
        model: device.model,
        isOnline: true,
      },
    ]);

    return snapshots[deviceDid] ?? null;
  }

  private async confirmDevicePowerState(
    session: XiaomiSession,
    deviceDid: string,
    expectedPower: boolean,
    options?: PowerConfirmationOptions,
  ): Promise<DevicePropSnapshot> {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 4);
    const initialDelayMs = Math.max(0, options?.initialDelayMs ?? 0);
    const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 2000);

    if (initialDelayMs > 0) {
      await sleep(initialDelayMs);
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const snapshot = await this.getSingleDeviceSnapshot(session, deviceDid);
      if (snapshot && snapshot.power === expectedPower) {
        return snapshot;
      }
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs);
      }
    }

    throw new Error(
      `米家设备状态确认失败，期望电源=${expectedPower ? '开启' : '关闭'}，did=${deviceDid}`,
    );
  }

  private assignPropValue(
    snapshot: DevicePropSnapshot,
    model: string,
    siid: number,
    piid: number,
    rawValue: unknown,
  ) {
    const numericValue = this.toNumericValue(rawValue);

    if (siid === 2 && piid === 1) {
      if (typeof rawValue === 'boolean') {
        snapshot.power = rawValue;
        return;
      }
      if (numericValue != null) {
        snapshot.power = numericValue === 1;
        return;
      }
    }

    if (siid === 3 && piid === 6 && numericValue != null) {
      snapshot.powerW = model.includes('lxzn.switch.cbcsmj')
        ? Number(numericValue.toFixed(1))
        : Number(numericValue.toFixed(1));
      return;
    }

    if (siid === 3 && piid === 2 && numericValue != null) {
      snapshot.currentA = model.includes('lxzn.switch.cbcsmj') || numericValue > 100
        ? Number((numericValue / 1000).toFixed(3))
        : Number(numericValue.toFixed(3));
      return;
    }

    if (siid === 3 && piid === 3 && numericValue != null) {
      snapshot.voltageV = model.includes('lxzn.switch.cbcsmj') || numericValue > 400
        ? Number((numericValue / 10).toFixed(1))
        : Number(numericValue.toFixed(1));
      return;
    }

    if (siid === 3 && piid === 1 && numericValue != null) {
      snapshot.totalKwh = this.normalizeTotalKwh(model, numericValue);
      return;
    }

    if (siid === 2 && piid === 2 && numericValue != null) {
      snapshot.powerW = Number(numericValue.toFixed(1));
      return;
    }

    if (siid === 2 && piid === 3 && numericValue != null) {
      snapshot.currentA = numericValue > 100 ? Number((numericValue / 1000).toFixed(3)) : Number(numericValue.toFixed(3));
      return;
    }

    if (siid === 2 && piid === 4 && numericValue != null) {
      snapshot.voltageV = numericValue > 400 ? Number((numericValue / 10).toFixed(1)) : Number(numericValue.toFixed(1));
      return;
    }

    if ((siid === 2 && piid === 5) || (siid === 2 && piid === 6)) {
      if (numericValue != null) {
        snapshot.totalKwh = this.normalizeTotalKwh(model, numericValue);
      }
    }
  }

  private normalizeTotalKwh(model: string, numericValue: number): number {
    if (model.includes('lxzn.switch.cbcsmj')) {
      const normalized = Number.isInteger(numericValue) ? numericValue / 100 : numericValue;
      return Number(normalized.toFixed(3));
    }

    const normalized = numericValue > 1000 ? numericValue / 1000 : numericValue;
    return Number(normalized.toFixed(3));
  }

  private parseHistoryNumericValue(rawValue: unknown): number | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = Number(parsed[0]);
          return Number.isFinite(first) ? first : null;
        }
      } catch {
        const direct = Number(rawValue);
        return Number.isFinite(direct) ? direct : null;
      }
    }
    if (Array.isArray(rawValue) && rawValue.length > 0) {
      const first = Number(rawValue[0]);
      return Number.isFinite(first) ? first : null;
    }
    return null;
  }

  private getDayKeyFromUnix(tsSec: number, timeZone: string): string {
    return getDayKey(new Date(tsSec * 1000), timeZone);
  }

  private dayKeyToDate(dayKey: string): Date {
    return dayKeyToDate(dayKey);
  }

  private getTodayDayKey(timeZone: string): string {
    return getDayKey(new Date(), timeZone);
  }

  private parseStoreDayHistory(
    rawValue: unknown,
    businessTimeZone: string,
  ): Array<{ dayKey: string; usageKwh: number }> {
    if (typeof rawValue !== 'string') return [];

    try {
      const parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed) || parsed.length < 2) return [];

      return parsed
        .slice(1)
        .map((row) => {
          if (typeof row !== 'string') return null;
          const [timeRaw, valueRaw] = row.split(',');
          const time = Number(timeRaw);
          const usage = Number(valueRaw);
          if (!Number.isFinite(time) || !Number.isFinite(usage)) return null;
          return {
            dayKey: this.getDayKeyFromUnix(time, businessTimeZone),
            usageKwh: Number((usage > 50 ? usage / 1000 : usage).toFixed(3)),
          };
        })
        .filter(Boolean) as Array<{ dayKey: string; usageKwh: number }>;
    } catch {
      return [];
    }
  }

  private buildDailyUsageFromCumulativeSamples(
    model: string,
    samples: Array<{ time: number; value: unknown }>,
    businessTimeZone: string,
  ): Array<{ dayKey: string; usageKwh: number }> {
    const normalized = samples
      .map((sample) => {
        const numeric = this.parseHistoryNumericValue(sample.value);
        if (numeric == null) return null;
        return {
          time: Number(sample.time),
          cumulativeKwh: this.normalizeTotalKwh(model, numeric),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.time - b!.time) as Array<{ time: number; cumulativeKwh: number }>;

    if (normalized.length < 2) return [];

    const byDay = new Map<string, { first: number; last: number }>();
    for (const sample of normalized) {
      const dayKey = this.getDayKeyFromUnix(sample.time, businessTimeZone);
      const day = byDay.get(dayKey);
      if (!day) {
        byDay.set(dayKey, { first: sample.cumulativeKwh, last: sample.cumulativeKwh });
      } else {
        day.last = sample.cumulativeKwh;
      }
    }

    const sortedDays = Array.from(byDay.keys()).sort();
    const result: Array<{ dayKey: string; usageKwh: number }> = [];
    let previousLast: number | null = null;

    for (const dayKey of sortedDays) {
      const day = byDay.get(dayKey)!;
      let usage = previousLast != null ? day.last - previousLast : day.last - day.first;
      if (!Number.isFinite(usage) || usage < 0) {
        usage = day.last - day.first;
      }
      result.push({
        dayKey,
        usageKwh: Number(Math.max(0, usage).toFixed(3)),
      });
      previousLast = day.last;
    }

    return result;
  }

  private normalizeCumulativeSamples(
    model: string,
    samples: Array<{ time: number; value: unknown }>,
    currentTotalKwh?: number | null,
  ): Array<{ time: number; cumulativeKwh: number }> {
    const normalized = samples
      .map((sample) => {
        const numeric = this.parseHistoryNumericValue(sample.value);
        if (numeric == null) return null;
        return {
          time: Number(sample.time),
          cumulativeKwh: this.normalizeTotalKwh(model, numeric),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.time - b!.time) as Array<{ time: number; cumulativeKwh: number }>;

    if (currentTotalKwh != null && Number.isFinite(currentTotalKwh)) {
      const nowSec = Math.floor(Date.now() / 1000);
      const last = normalized.at(-1);
      if (!last || nowSec > last.time) {
        normalized.push({
          time: nowSec,
          cumulativeKwh: Number(currentTotalKwh.toFixed(3)),
        });
      } else if (nowSec === last.time) {
        last.cumulativeKwh = Number(currentTotalKwh.toFixed(3));
      }
    }

    return normalized;
  }

  private estimateCumulativeAtTime(
    normalizedSamples: Array<{ time: number; cumulativeKwh: number }>,
    targetSec: number,
  ): number | null {
    if (normalizedSamples.length === 0) return null;

    let previous: { time: number; cumulativeKwh: number } | null = null;
    let next: { time: number; cumulativeKwh: number } | null = null;

    for (const sample of normalizedSamples) {
      if (sample.time <= targetSec) {
        previous = sample;
      }
      if (sample.time >= targetSec) {
        next = sample;
        break;
      }
    }

    if (previous && next) {
      if (previous.time === next.time) {
        return previous.cumulativeKwh;
      }
      const ratio = (targetSec - previous.time) / (next.time - previous.time);
      return Number(
        (previous.cumulativeKwh + (next.cumulativeKwh - previous.cumulativeKwh) * ratio).toFixed(3),
      );
    }

    if (previous) return previous.cumulativeKwh;
    if (next) return next.cumulativeKwh;
    return null;
  }

  private computeTodayUsageFromCounterSamples(
    model: string,
    samples: Array<{ time: number; value: unknown }>,
    businessTimeZone: string,
    currentTotalKwh?: number | null,
  ): number | null {
    const normalized = this.normalizeCumulativeSamples(model, samples, currentTotalKwh);
    if (normalized.length === 0) return null;

    const todayStartSec = Math.floor(
      getBusinessDayStartUtc(new Date(), businessTimeZone).getTime() / 1000,
    );
    const baselineKwh = this.estimateCumulativeAtTime(normalized, todayStartSec);
    const currentKwh =
      currentTotalKwh != null && Number.isFinite(currentTotalKwh)
        ? Number(currentTotalKwh.toFixed(3))
        : normalized.at(-1)?.cumulativeKwh ?? null;

    if (baselineKwh == null || currentKwh == null) {
      return null;
    }

    return Number(Math.max(0, currentKwh - baselineKwh).toFixed(3));
  }

  private async fetchHistorySamples(
    session: XiaomiSession,
    did: string,
    body: Record<string, any>,
  ): Promise<any[]> {
    const path = '/app/user/get_user_device_data';
    const resp = await this.requestIo(session, 'POST', path, undefined, body) as any[] | { list?: any[] } | null;
    if (Array.isArray(resp)) return resp;
    if (Array.isArray(resp?.list)) return resp.list;
    return [];
  }

  private async fetchCumulativeCounterSamples(
    session: XiaomiSession,
    device: { did: string; model: string; totalKwh?: number | null },
    timeStartSec: number,
    timeEndSec: number,
    limit: number,
  ): Promise<Array<{ time: number; cumulativeKwh: number }>> {
    const cumulativeRows = await this.fetchHistorySamples(session, device.did, {
      did: device.did,
      key: '3.1',
      type: 'prop',
      time_start: timeStartSec,
      time_end: timeEndSec,
      limit,
    }).catch(() => []);

    return this.normalizeCumulativeSamples(
      device.model,
      cumulativeRows.map((row) => ({
        time: Number(row?.time ?? 0),
        value: row?.value,
      })),
      device.totalKwh ?? null,
    );
  }

  private async fetchDailyUsageHistoryForDevice(
    session: XiaomiSession,
    device: { did: string; model: string; roomId: string | null; totalKwh?: number | null },
    days: number,
    businessTimeZone: string,
  ): Promise<{ dailyUsage: Array<{ dayKey: string; usageKwh: number }>; todayUsageKwh: number | null }> {
    const todayStartUtc = getBusinessDayStartUtc(new Date(), businessTimeZone);
    const timeStart = Math.floor((todayStartUtc.getTime() - days * 24 * 60 * 60 * 1000) / 1000);
    const timeEnd = Math.floor(Date.now() / 1000);
    const limit = Math.min(Math.max(days * 160, 1500), 5000);

    const normalizedCounterSamples = await this.fetchCumulativeCounterSamples(
      session,
      device,
      timeStart,
      timeEnd,
      limit,
    );

    const todayUsageKwh = this.computeTodayUsageFromCounterSamples(
      device.model,
      normalizedCounterSamples.map((sample) => ({
        time: sample.time,
        value: sample.cumulativeKwh,
      })),
      businessTimeZone,
    );

    const cumulativeDaily = this.buildDailyUsageFromCumulativeSamples(
      device.model,
      normalizedCounterSamples.map((sample) => ({
        time: sample.time,
        value: sample.cumulativeKwh,
      })),
      businessTimeZone,
    );
    const nonZeroCumulativeDaily = cumulativeDaily.filter((item) => item.usageKwh > 0);
    if (nonZeroCumulativeDaily.length > 0) {
      return {
        dailyUsage: nonZeroCumulativeDaily,
        todayUsageKwh,
      };
    }

    const storeRows = await this.fetchHistorySamples(session, device.did, {
      did: device.did,
      key: 'powerCost',
      type: 'store',
      time_start: timeStart,
      time_end: timeEnd,
      limit: days + 5,
      group: 'day',
    }).catch(() => []);

    return {
      dailyUsage: storeRows
        .flatMap((row) => this.parseStoreDayHistory(row?.value, businessTimeZone))
        .filter((item) => item.usageKwh > 0),
      todayUsageKwh,
    };
  }

  private async syncDailyHistory(days: number = 35): Promise<void> {
    const session = await this.getSession();
    if (!session || /^mock_/.test(session.serviceToken)) return;
    const businessTimeZone = await getBusinessTimeZoneSetting();
    const pricePerKwh = await getPricePerKwhSetting();

    const devices = await prisma.device.findMany({
      where: {
        roomId: { not: null },
      },
      select: {
        did: true,
        model: true,
        roomId: true,
        totalKwh: true,
      },
    });

    if (devices.length === 0) return;

    const roomDayUsage = new Map<string, number>();
    const roomTodayUsage = new Map<string, number>();
    const todayDayKey = this.getTodayDayKey(businessTimeZone);
    for (const device of devices) {
      const { dailyUsage, todayUsageKwh } = await this.fetchDailyUsageHistoryForDevice(
        session,
        device,
        days,
        businessTimeZone,
      ).catch(() => ({
        dailyUsage: [],
        todayUsageKwh: null,
      }));
      for (const item of dailyUsage ?? []) {
        if (!device.roomId || item.dayKey === todayDayKey || item.usageKwh <= 0) continue;
        const mapKey = `${device.roomId}:${item.dayKey}`;
        roomDayUsage.set(mapKey, Number(((roomDayUsage.get(mapKey) ?? 0) + item.usageKwh).toFixed(3)));
      }
      if (device.roomId && todayUsageKwh != null && todayUsageKwh > 0) {
        roomTodayUsage.set(
          device.roomId,
          Number(((roomTodayUsage.get(device.roomId) ?? 0) + todayUsageKwh).toFixed(3)),
        );
      }
    }

    for (const [mapKey, usageKwh] of roomDayUsage.entries()) {
      const [roomId, dayKey] = mapKey.split(':');
      const date = this.dayKeyToDate(dayKey);

      await prisma.dailyEnergy.upsert({
        where: { roomId_date: { roomId, date } },
        update: {
          usageKwh,
          cost: Number((usageKwh * pricePerKwh).toFixed(2)),
        },
        create: {
          roomId,
          date,
          usageKwh,
          cost: Number((usageKwh * pricePerKwh).toFixed(2)),
        },
      });
    }

    const todayDate = this.dayKeyToDate(todayDayKey);
    for (const [roomId, usageKwh] of roomTodayUsage.entries()) {
      await prisma.dailyEnergy.upsert({
        where: { roomId_date: { roomId, date: todayDate } },
        update: {
          usageKwh,
          cost: Number((usageKwh * pricePerKwh).toFixed(2)),
        },
        create: {
          roomId,
          date: todayDate,
          usageKwh,
          cost: Number((usageKwh * pricePerKwh).toFixed(2)),
        },
      });
    }

    this.lastDailyHistorySyncAt = Date.now();
  }

  public async ensureDailyHistoryFresh(days: number = 35, maxAgeMs: number = 60 * 1000): Promise<void> {
    if (this.lastDailyHistorySyncAt && Date.now() - this.lastDailyHistorySyncAt <= maxAgeMs) {
      return;
    }

    if (this.dailyHistorySyncPromise) {
      await this.dailyHistorySyncPromise;
      return;
    }

    this.dailyHistorySyncPromise = this.syncDailyHistory(days)
      .catch((error) => {
        console.warn('[XiaomiAdapter] ensureDailyHistoryFresh 刷新失败：', error?.message || error);
      })
      .finally(() => {
        this.dailyHistorySyncPromise = null;
      });

    await this.dailyHistorySyncPromise;
  }

  public async getRoomTodayHourlyUsage(
    roomId: string,
    businessTimeZone: string = DEFAULT_BUSINESS_TIMEZONE,
  ): Promise<Array<{ hour: number; usage: number }>> {
    const session = await this.getSession();
    if (!session || /^mock_/.test(session.serviceToken)) {
      return Array.from({ length: 24 }, (_, hour) => ({ hour, usage: 0 }));
    }

    const devices = await prisma.device.findMany({
      where: { roomId },
      select: {
        did: true,
        model: true,
        totalKwh: true,
      },
    });

    if (devices.length === 0) {
      return Array.from({ length: 24 }, (_, hour) => ({ hour, usage: 0 }));
    }

    const dayStartSec = Math.floor(
      getBusinessDayStartUtc(new Date(), businessTimeZone).getTime() / 1000,
    );
    const nowSec = Math.floor(Date.now() / 1000);
    const limit = 1500;
    const usageByHour = Array.from({ length: 24 }, () => 0);

    for (const device of devices) {
      const samples = await this.fetchCumulativeCounterSamples(
        session,
        device,
        dayStartSec - 3600,
        nowSec,
        limit,
      ).catch(() => []);

      if (samples.length === 0) {
        continue;
      }

      for (let hour = 0; hour < 24; hour += 1) {
        const startSec = dayStartSec + hour * 3600;
        const endSec = Math.min(dayStartSec + (hour + 1) * 3600, nowSec);
        if (endSec <= startSec) {
          continue;
        }

        const startKwh = this.estimateCumulativeAtTime(samples, startSec);
        const endKwh = this.estimateCumulativeAtTime(samples, endSec);
        if (startKwh == null || endKwh == null) {
          continue;
        }

        usageByHour[hour] += Math.max(0, endKwh - startKwh);
      }
    }

    return usageByHour.map((usage, hour) => ({
      hour,
      usage: Number(usage.toFixed(3)),
    }));
  }

  private toNumericValue(rawValue: unknown): number | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
    if (typeof rawValue === 'string') {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private assignFallbackRoomIds(
    devices: XiaomiDeviceInfo[],
    rooms: { id: string; roomNumber: string; name: string }[],
    existingDevices: { did: string; roomId: string | null }[],
  ): void {
    const existingRoomMap = new Map(
      existingDevices
        .filter((device) => !!device.roomId)
        .map((device) => [device.did, device.roomId as string]),
    );

    const occupiedRoomIds = new Set<string>();

    for (const device of devices) {
      if (device.roomId) {
        occupiedRoomIds.add(device.roomId);
      }
    }

    for (const device of devices) {
      if (device.roomId) continue;
      const existingRoomId = existingRoomMap.get(device.did);
      if (existingRoomId && rooms.some((room) => room.id === existingRoomId) && !occupiedRoomIds.has(existingRoomId)) {
        device.roomId = existingRoomId;
        occupiedRoomIds.add(existingRoomId);
        this.lastRoomMap[device.did] = existingRoomId;
      }
    }

    const availableRooms = rooms.filter((room) => !occupiedRoomIds.has(room.id));

    for (const device of devices) {
      if (device.roomId) continue;
      const nextRoom = availableRooms.shift();
      if (!nextRoom) break;
      device.roomId = nextRoom.id;
      this.lastRoomMap[device.did] = nextRoom.id;
      occupiedRoomIds.add(nextRoom.id);
    }
  }

  private resolveRoomId(rooms: { id: string; roomNumber: string; name: string }[], raw: RawDevice): string | null {
    const name = `${raw.name ?? ''} ${raw.did ?? ''}`.toLowerCase();
    for (const r of rooms) {
      if (name.includes(String(r.roomNumber))) return r.id;
      if (r.name && name.includes(r.name.toLowerCase())) return r.id;
    }
    const fallback = this.lastRoomMap[raw.did];
    if (fallback) return fallback;

    const numMatch = /(10[1-9]|11[0-4])/.exec(name);
    if (numMatch) {
      const r = rooms.find((x) => x.roomNumber === numMatch[1]);
      if (r) { this.lastRoomMap[raw.did] = r.id; return r.id; }
    }
    const chineseMap: Record<string, string[]> = {
      keting: ['客厅', 'living'],
      woshi: ['主卧', '卧室', 'master'],
      chwoshi: ['次卧', 'bedroom2'],
      kt: ['客厅'],
      ws: ['卫生间', 'wash'],
      cf: ['厨房', 'kitchen'],
    };
    for (const [_key, tokens] of Object.entries(chineseMap)) {
      for (const t of tokens) {
        if (name.includes(t)) {
          const r = rooms.find((x) => x.roomNumber === '101');
          if (r) { this.lastRoomMap[raw.did] = r.id; return r.id; }
        }
      }
    }
    return null;
  }

  public async syncDevicesToDb(
    operatorUserId: string | null,
    actorContext?: OperationActorContext,
  ): Promise<void> {
    await prisma.device.deleteMany({
      where: { did: { startsWith: 'miot_device_' } },
    });

    const session = await this.getSession();
    if (!session || /^mock_/.test(session.serviceToken)) {
      throw new Error('米家尚未完成真实登录，当前没有可用的真实会话。请先在系统设置里重新登录米家账号。');
    }

    const devices = await this.fetchDevices();
    if (devices.length === 0) {
      throw new Error('米家登录已建立，但本次没有拉取到任何真实设备。请检查该账号下是否真的已绑定设备，或先完成米家安全验证。');
    }

    const now = new Date();
    for (const device of devices) {
      const existing = await prisma.device.findUnique({
        where: { did: device.did },
        select: { name: true },
      });

      await prisma.device.upsert({
        where: { did: device.did },
        update: {
          name: existing?.name?.trim() || device.name,
          model: device.model,
          roomId: device.roomId,
          status: (device.online ? 'online' : 'offline') as DeviceStatus,
          power: device.power ?? null,
          powerW: device.powerW ?? null,
          currentA: device.currentA ?? null,
          voltageV: device.voltageV ?? null,
          totalKwh: device.totalKwh ?? null,
          lastSyncAt: now,
        },
        create: {
          did: device.did,
          name: device.name,
          model: device.model,
          roomId: device.roomId,
          status: (device.online ? 'online' : 'offline') as DeviceStatus,
          power: device.power ?? null,
          powerW: device.powerW ?? null,
          currentA: device.currentA ?? null,
          voltageV: device.voltageV ?? null,
          totalKwh: device.totalKwh ?? null,
          lastSyncAt: now,
        },
      });
    }
    await writeOperation(
      operatorUserId,
      OperationType.sync_devices,
      null,
      {
        action: 'sync_devices',
        actionLabel: '同步米家设备',
        source: actorContext?.source,
        sourceLabel: actorContext?.sourceLabel,
        totalCount: devices.length,
        note: `同步 ${devices.length} 台设备`,
      },
      true,
    );
  }

  private async getDeviceAuditDetails(deviceDid: string): Promise<{
    roomId: string | null;
    roomNumber: string | null;
    roomName: string | null;
    displayName: string | null;
    deviceName: string | null;
  }> {
    const device = await prisma.device.findUnique({
      where: { did: deviceDid },
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
            name: true,
          },
        },
      },
    });

    return {
      roomId: device?.room?.id ?? null,
      roomNumber: device?.room?.roomNumber ?? null,
      roomName: device?.room?.name ?? null,
      displayName:
        device?.room?.roomNumber
          ? formatRoomDisplayName(device.room.roomNumber, device.room.name)
          : device?.name?.trim() || null,
      deviceName: device?.name?.trim() || null,
    };
  }

  public async turnOn(
    deviceDid: string,
    operatorUserId: string | null | undefined,
    actorContext?: OperationActorContext,
    confirmationOptions?: PowerConfirmationOptions,
  ): Promise<boolean> {
    const auditTarget = await this.getDeviceAuditDetails(deviceDid);

    try {
      const session = await this.getSession();
      if (!session) {
        throw new AppError(400, 'XIAOMI_NOT_LOGGED_IN', '米家未登录，无法开启设备');
      }
      if (/^mock_/.test(session.serviceToken)) {
        throw new AppError(400, 'XIAOMI_SESSION_INVALID', '当前米家会话不是真实会话，无法开启设备');
      }

      const result = await this.requestIo(session, 'POST', '/app/miotspec/prop/set', {}, {
        params: [{ did: deviceDid, siid: 2, piid: 1, value: true }],
      });
      if (Array.isArray(result)) {
        const failed = result.find((item) => item?.code !== undefined && Number(item.code) !== 0);
        if (failed) {
          throw new Error(`米家返回开启失败 code=${failed.code}`);
        }
      }
      const confirmed = await this.confirmDevicePowerState(
        session,
        deviceDid,
        true,
        confirmationOptions,
      );
      await prisma.device.update({
        where: { did: deviceDid },
        data: {
          power: true,
          powerW: confirmed.powerW ?? null,
          currentA: confirmed.currentA ?? null,
          voltageV: confirmed.voltageV ?? null,
          totalKwh: confirmed.totalKwh ?? null,
          lastSyncAt: new Date(),
        },
      });
      await writeOperation(
        operatorUserId ?? null,
        OperationType.control_device,
        auditTarget.roomId,
        {
          action: 'turn_on',
          actionLabel: actorContext?.source === 'system_auto' ? '自动开电' : '手动开电',
          source: actorContext?.source,
          sourceLabel: actorContext?.sourceLabel,
          roomNumber: auditTarget.roomNumber,
          roomName: auditTarget.roomName,
          displayName: auditTarget.displayName,
          deviceName: auditTarget.deviceName,
          did: deviceDid,
          powerAction: 'on',
        },
        true,
      );
      return true;
    } catch (e: any) {
      await writeOperation(
        operatorUserId ?? null,
        OperationType.control_device,
        auditTarget.roomId,
        {
          action: 'turn_on',
          actionLabel: actorContext?.source === 'system_auto' ? '自动开电失败' : '手动开电失败',
          source: actorContext?.source,
          sourceLabel: actorContext?.sourceLabel,
          roomNumber: auditTarget.roomNumber,
          roomName: auditTarget.roomName,
          displayName: auditTarget.displayName,
          deviceName: auditTarget.deviceName,
          did: deviceDid,
          powerAction: 'on',
          error: e?.message || String(e),
        },
        false,
      );
      throw new AppError(
        e instanceof AppError ? e.statusCode : 502,
        e instanceof AppError ? e.code : 'XIAOMI_DEVICE_CONTROL_FAILED',
        e?.message || '米家开启设备失败',
      );
    }
  }

  public async turnOff(
    deviceDid: string,
    operatorUserId: string | null | undefined,
    actorContext?: OperationActorContext,
  ): Promise<boolean> {
    const auditTarget = await this.getDeviceAuditDetails(deviceDid);

    try {
      const session = await this.getSession();
      if (!session) {
        throw new AppError(400, 'XIAOMI_NOT_LOGGED_IN', '米家未登录，无法关闭设备');
      }
      if (/^mock_/.test(session.serviceToken)) {
        throw new AppError(400, 'XIAOMI_SESSION_INVALID', '当前米家会话不是真实会话，无法关闭设备');
      }

      const result = await this.requestIo(session, 'POST', '/app/miotspec/prop/set', {}, {
        params: [{ did: deviceDid, siid: 2, piid: 1, value: false }],
      });
      if (Array.isArray(result)) {
        const failed = result.find((item) => item?.code !== undefined && Number(item.code) !== 0);
        if (failed) {
          throw new Error(`米家返回断电失败 code=${failed.code}`);
        }
      }
      const confirmed = await this.confirmDevicePowerState(session, deviceDid, false);
      await prisma.device.update({
        where: { did: deviceDid },
        data: {
          power: false,
          powerW: confirmed.powerW ?? 0,
          currentA: confirmed.currentA ?? 0,
          voltageV: confirmed.voltageV ?? null,
          totalKwh: confirmed.totalKwh ?? null,
          lastSyncAt: new Date(),
        },
      });
      await writeOperation(
        operatorUserId ?? null,
        OperationType.control_device,
        auditTarget.roomId,
        {
          action: 'turn_off',
          actionLabel: actorContext?.source === 'system_auto' ? '自动断电' : '手动断电',
          source: actorContext?.source,
          sourceLabel: actorContext?.sourceLabel,
          roomNumber: auditTarget.roomNumber,
          roomName: auditTarget.roomName,
          displayName: auditTarget.displayName,
          deviceName: auditTarget.deviceName,
          did: deviceDid,
          powerAction: 'off',
        },
        true,
      );
      return true;
    } catch (e: any) {
      await writeOperation(
        operatorUserId ?? null,
        OperationType.control_device,
        auditTarget.roomId,
        {
          action: 'turn_off',
          actionLabel: actorContext?.source === 'system_auto' ? '自动断电失败' : '手动断电失败',
          source: actorContext?.source,
          sourceLabel: actorContext?.sourceLabel,
          roomNumber: auditTarget.roomNumber,
          roomName: auditTarget.roomName,
          displayName: auditTarget.displayName,
          deviceName: auditTarget.deviceName,
          did: deviceDid,
          powerAction: 'off',
          error: e?.message || String(e),
        },
        false,
      );
      throw new AppError(
        e instanceof AppError ? e.statusCode : 502,
        e instanceof AppError ? e.code : 'XIAOMI_DEVICE_CONTROL_FAILED',
        e?.message || '米家关闭设备失败',
      );
    }
  }

  public async getRealtimeByRoom(roomId: string): Promise<{
    powerW: number; currentA: number; voltageV: number; totalKwh: number; online: boolean;
  }> {
    const devices = await prisma.device.findMany({ where: { roomId } });
    let totalPowerW = 0;
    let totalKwh = 0;
    let allOnline = devices.length > 0;

    for (const device of devices) {
      const powerW = device.power === true ? (device.powerW ?? 0) : 0;
      totalPowerW += powerW;
      totalKwh += device.totalKwh ?? 0;
      if (device.status !== DeviceStatus.online) allOnline = false;
    }

    if (devices.length === 0) {
      totalPowerW = 0;
    }
    const voltageV = devices.length > 0
      ? (devices.find((d) => d.voltageV != null)?.voltageV ?? 220)
      : 220;
    const currentA = totalPowerW > 0 && voltageV > 0 ? totalPowerW / voltageV : 0;

    return {
      powerW: totalPowerW,
      currentA,
      voltageV,
      totalKwh,
      online: allOnline,
    };
  }

  public async refreshAllRoomsRealtime(): Promise<void> {
    const devices = await this.fetchDevices();
    for (const device of devices) {
      await prisma.device.upsert({
        where: { did: device.did },
        update: {
          name: device.name,
          model: device.model,
          roomId: device.roomId ?? undefined,
          status: (device.online ? 'online' : 'offline') as DeviceStatus,
          power: device.power ?? null,
          powerW: device.powerW ?? null,
          currentA: device.currentA ?? null,
          voltageV: device.voltageV ?? null,
          totalKwh: device.totalKwh ?? null,
          lastSyncAt: new Date(),
        },
        create: {
          did: device.did,
          name: device.name,
          model: device.model,
          roomId: device.roomId,
          status: (device.online ? 'online' : 'offline') as DeviceStatus,
          power: device.power ?? null,
          powerW: device.powerW ?? null,
          currentA: device.currentA ?? null,
          voltageV: device.voltageV ?? null,
          totalKwh: device.totalKwh ?? null,
          lastSyncAt: new Date(),
        },
      });
    }
  }

  public async ensureRealtimeFresh(maxAgeMs: number = 15000): Promise<void> {
    const latestSync = await prisma.device.aggregate({
      _max: { lastSyncAt: true },
    });

    const lastSyncAt = latestSync._max.lastSyncAt;
    if (lastSyncAt && Date.now() - lastSyncAt.getTime() <= maxAgeMs) {
      return;
    }

    if (this.realtimeRefreshPromise) {
      await this.realtimeRefreshPromise;
      return;
    }

    this.realtimeRefreshPromise = this.refreshAllRoomsRealtime()
      .catch((error) => {
        console.warn('[XiaomiAdapter] ensureRealtimeFresh 刷新失败：', error?.message || error);
      })
      .finally(() => {
        this.realtimeRefreshPromise = null;
      });

    await this.realtimeRefreshPromise;
  }
}

export const xiaomiAdapter = XiaomiAdapter.getInstance();
export default XiaomiAdapter;
