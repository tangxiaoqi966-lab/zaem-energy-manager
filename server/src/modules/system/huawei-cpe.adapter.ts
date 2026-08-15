import { URL } from 'url';
import * as crypto from 'crypto';
import {
  type FiveGCpeRuntime,
  type WifiBandRuntime,
  type WifiStationClient,
} from '@shared/index';

export interface HuaweiCpeCredentials {
  baseUrl: string;
  username?: string | null;
  password?: string;
  adminPassword?: string | null;
}

const DEFAULT_TIMEOUT_MS = 8000;

export interface HuaweiCpeSession {
  baseUrl: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: number;
  rawCookies: string[];
}

const parseXml = (xml: string): Record<string, any> => {
  const result: Record<string, any> = {};
  const stack: Array<{ name: string; value: Record<string, any> }> = [];
  let current: Record<string, any> = result;
  const regex = /<([^?/!\s>][^>\s/]*)([^>]*)>([\s\S]*?)<\/\1>|<([^?/!\s>][^>\s/]*)([^>]*)\/?>/g;
  let match;
  const parseAttrs = (attrStr: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrStr))) attrs[m[1]] = m[2];
    return attrs;
  };
  while ((match = regex.exec(xml)) !== null) {
    const tag = match[1] || match[4];
    const attrStr = match[2] || match[5] || '';
    const body = match[3] ?? '';
    const attrs = parseAttrs(attrStr);
    const node: Record<string, any> = {};
    if (Object.keys(attrs).length) node['$attrs'] = attrs;
    if (/^\s*$/.test(body)) {
      node['_value'] = '';
    } else if (!/</.test(body)) {
      node['_value'] = body;
    } else {
      Object.assign(node, parseXml(body));
    }
    const existing = current[tag];
    if (existing == null) {
      current[tag] = node;
    } else if (Array.isArray(existing)) {
      existing.push(node);
    } else {
      current[tag] = [existing, node];
    }
  }
  return result;
};

const getText = (node: any): string => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node._value === 'string') return node._value;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  return '';
};

const firstText = (node: any): string => {
  if (Array.isArray(node)) return getText(node[0]);
  return getText(node);
};

const toNumber = (value: any): number | null => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
};

const toBool = (value: any): boolean | null => {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'ok', 'connected', 'enable', 'enabled'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'disable', 'disabled', 'disconnected'].includes(s)) return false;
  return null;
};

const toMbps = (value: any): number | null => {
  const n = toNumber(value);
  if (n == null || n < 0) return null;
  if (n >= 10000) return Number(((n * 8) / 1_000_000).toFixed(2));
  return Number(n.toFixed(2));
};

const mapRat = (opts: {
  currentNetworkType?: any;
  currentNetworkTypeEx?: any;
  rat?: any;
  workmode?: any;
  endcStatus?: any;
  nrSignalBars?: any;
}): FiveGCpeRuntime['currentRat'] => {
  const joined = [
    opts.currentNetworkType,
    opts.currentNetworkTypeEx,
    opts.rat,
    opts.workmode,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  const endcEnabled = String(opts.endcStatus ?? '').trim() === '1';
  const nrBars = toNumber(opts.nrSignalBars);
  if (
    endcEnabled ||
    (nrBars != null && nrBars > 0) ||
    /\b(19|20|30|31|7|1011|nr|5g|nsa|sa|endc)\b/.test(joined)
  ) {
    return '5G';
  }
  return '4G';
};

const normalizeSignalBars = (value: any): 0 | 1 | 2 | 3 | 4 | 5 | null => {
  const n = toNumber(value);
  if (n == null) return null;
  return Math.max(0, Math.min(5, Math.round(n))) as 0 | 1 | 2 | 3 | 4 | 5;
};

export class HuaweiCpeAdapter {
  private session: HuaweiCpeSession | null = null;

  constructor(private readonly credentials: HuaweiCpeCredentials) {
    if (!credentials?.baseUrl) throw new Error('Huawei CPE baseUrl 不能为空');
  }

  private buildUrl(path: string): string {
    const base = this.credentials.baseUrl.replace(/\/+$/, '');
    const u = new URL(path.startsWith('http') ? path : base + (path.startsWith('/') ? path : '/' + path));
    return u.toString();
  }

  private async rawFetch(
    input: string,
    init: RequestInit & { raw?: boolean } = {},
  ): Promise<any> {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      Accept: '*/*',
    };
    const cookieStr = this.session?.rawCookies?.length
      ? this.session.rawCookies
          .map((c) => c.split(';')[0].trim())
          .filter(Boolean)
          .join('; ')
      : '';
    if (cookieStr) headers['Cookie'] = cookieStr;
    if (this.session?.csrfToken && !headers['__RequestVerificationToken']) {
      headers['__RequestVerificationToken'] = this.session.csrfToken;
    }
    if (typeof init.headers === 'object' && init.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, any>)) {
        if (v != null && v !== '') headers[k] = String(v);
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const resp = await fetch(input, {
        method: init.method || 'GET',
        body: init.body as any,
        headers,
        signal: controller.signal,
        redirect: 'manual',
      });
      const cookies = resp.headers && (resp.headers as any).getSetCookie
        ? (resp.headers as any).getSetCookie()
        : [];
      const setCookies = Array.isArray(cookies) ? cookies : [];
      if (setCookies.length) {
        if (this.session) {
          this.session.rawCookies = [...this.session.rawCookies, ...setCookies];
        }
      }
      for (const c of setCookies) {
        const m = /(?:^|;\s*)SessionID=([^;]+)/i.exec(c);
        if (m && this.session) this.session.sessionToken = m[1];
      }
      const csrfFromHeader = (resp.headers as any)?.get?.('__requestverificationtoken') || (resp.headers as any)?.get?.('__RequestVerificationToken');
      if (csrfFromHeader && this.session) {
        this.session.csrfToken = String(csrfFromHeader).split('#')[0];
      }
      const text = await resp.text();
      return { ok: resp.ok, status: resp.status, text, headers: resp.headers };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async ensureSession(): Promise<HuaweiCpeSession> {
    if (this.session && this.session.expiresAt > Date.now() + 30_000) {
      return this.session;
    }
    const base = this.credentials.baseUrl.replace(/\/+$/, '');
    const home = await this.rawFetch(base + '/html/home.html', { method: 'GET' });
    const htmlText = String(home?.text || '');
    const csrfMatch =
      /<meta[^>]+name=['"]csrf_token['"][^>]+content=['"]([^'"]+)['"]/i.exec(htmlText) ||
      /csrf_token['"]\s*:\s*['"]([^'"]+)['"]/.exec(htmlText);
    const sessionMatch =
      /(?:^|;\s*)SessionID=([^;]+)/i.exec(String((home?.headers as any)?.getSetCookie ? (home?.headers as any).getSetCookie().join(';') : htmlText));
    this.session = {
      baseUrl: base,
      sessionToken: sessionMatch?.[1] || '',
      csrfToken: csrfMatch?.[1] || '',
      expiresAt: Date.now() + 30 * 60 * 1000,
      rawCookies: home?.headers ? ((home?.headers as any)?.getSetCookie?.() || []) : [],
    };
    try {
      const verifyResp = await this.rawFetch(base + '/api/webserver/SesTokInfo', { method: 'GET' });
      if (verifyResp?.text) {
        const doc = parseXml(String(verifyResp.text));
        const SesInfo = firstText(doc?.response?.SesInfo || doc?.SesInfo || doc?.SesTokenInfo);
        const TokInfo = firstText(doc?.response?.TokInfo || doc?.TokInfo);
        if (SesInfo) this.session.sessionToken = SesInfo;
        if (TokInfo) this.session.csrfToken = TokInfo;
      }
    } catch {}
    try {
      const stateResp = await this.rawFetch(base + '/api/user/state-login', { method: 'GET' });
      if (stateResp?.text) {
        const doc = parseXml(String(stateResp.text));
        const state = toNumber(firstText(doc?.response?.State || doc?.State));
        const username = firstText(doc?.response?.Username || doc?.Username);
        if (state === 0 && !username) {
          await this.doLogin();
        }
      } else {
        await this.doLogin();
      }
    } catch {
      await this.doLogin();
    }
    return this.session;
  }

  private async doLogin(): Promise<void> {
    if (!this.session) this.session = this.makeEmptySession();
    const username = this.credentials.username || 'admin';
    const rawPwd = this.credentials.adminPassword ?? this.credentials.password ?? '';
    const resp = await this.rawFetch(this.buildUrl('/api/user/challenge_login'), { method: 'GET' });
    let firstNonce = '';
    let iterations = 100;
    if (resp?.text) {
      const doc = parseXml(String(resp.text));
      firstNonce = firstText(doc?.response?.firstnonce || doc?.firstnonce);
      const it = toNumber(firstText(doc?.response?.iterations || doc?.iterations));
      if (it != null) iterations = it;
    }
    const tokenForPwd = this.session?.csrfToken || '';
    const pwd = `${username}${rawPwd}${tokenForPwd}`;
    const pwdHash = crypto.createHash('sha256').update(pwd).digest('base64');
    const clientNonce = firstNonce || crypto.randomBytes(16).toString('hex');
    const saltedPwd = crypto.pbkdf2Sync(pwdHash, clientNonce, iterations, 32, 'sha256').toString('hex');
    const clientKey = crypto.createHmac('sha256', saltedPwd).update('Client Key').digest('hex');
    const storedKey = crypto.createHash('sha256').update(clientKey).digest('hex');
    const authMsg = `${username},${clientNonce},${clientNonce}`;
    const clientSig = crypto
      .createHmac('sha256', storedKey)
      .update(authMsg)
      .digest('hex');
    const a = Buffer.from(clientKey, 'hex');
    const b = Buffer.from(clientSig, 'hex');
    if (a.length !== b.length) {
      throw new Error('长度错误，无法计算 clientProof');
    }
    const proofBytes = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i += 1) proofBytes[i] = a[i] ^ b[i];
    const clientProof = proofBytes.toString('hex');
    const loginBody =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<request><Username>${username}</Username><firstnonce>${clientNonce}</firstnonce>` +
      `<nonce>${clientNonce}</nonce><level_value>2</level_value><clientproof>${clientProof}</clientproof>` +
      `<finalnonce>${clientNonce}</finalnonce></request>`;
    const loginResp = await this.rawFetch(this.buildUrl('/api/user/authentication_login'), {
      method: 'POST',
      body: loginBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(this.session?.csrfToken ? { __RequestVerificationToken: this.session.csrfToken } : {}),
      },
    });
    if (!loginResp?.text) return;
    const doc = parseXml(String(loginResp.text));
    const rsp = firstText(doc?.response || doc);
    const err = firstText(doc?.response?.code || doc?.code);
    if (err && err !== '-1' && err !== '0') {
      throw new Error(`Huawei CPE 登录失败（错误码 ${err}）`);
    }
    if (/fail|error/i.test(rsp) && !rsp) {
      try {
        const simple = `<?xml version="1.0" encoding="UTF-8"?><request><Username>${username}</Username><Password>${pwdHash}</Password><password_type>4</password_type></request>`;
        const simpleResp = await this.rawFetch(this.buildUrl('/api/user/login'), {
          method: 'POST',
          body: simple,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            ...(this.session?.csrfToken ? { __RequestVerificationToken: this.session.csrfToken } : {}),
          },
        });
        if (simpleResp?.text && /fail|error/i.test(String(simpleResp.text))) {
          throw new Error('Huawei CPE 登录失败：用户名或密码错误');
        }
      } catch (e) {
        if (e instanceof Error && /用户名或密码错误/.test(e.message)) throw e;
      }
    }
  }

  private makeEmptySession(): HuaweiCpeSession {
    return {
      baseUrl: this.credentials.baseUrl.replace(/\/+$/, ''),
      sessionToken: '',
      csrfToken: '',
      expiresAt: Date.now() + 5 * 60 * 1000,
      rawCookies: [],
    };
  }

  private async getApi(path: string): Promise<any> {
    await this.ensureSession();
    const url = this.buildUrl(path);
    const r = await this.rawFetch(url, { method: 'GET' });
    const text = String(r?.text || '');
    try {
      return parseXml(text);
    } catch {
      return text;
    }
  }

  public async fetchStatus(): Promise<FiveGCpeRuntime> {
    const [
      devInfo,
      status,
      monitorStatus,
      traffic,
      monthly,
      daily,
      signal,
      plmn,
      wlanBasic,
      wlanBasic5g,
      wlanHostList,
    ] = await Promise.all([
      this.getApi('/api/device/information').catch(() => null),
      this.getApi('/api/monitoring/status').catch(() => null),
      this.getApi('/api/monitoring/converged-status').catch(() => null),
      this.getApi('/api/monitoring/traffic-statistics').catch(() => null),
      this.getApi('/api/monitoring/month_statistics').catch(() => null),
      this.getApi('/api/monitoring/start_date').catch(() => null),
      this.getApi('/api/device/signal').catch(() => null),
      this.getApi('/api/net/current-plmn').catch(() => null),
      this.getApi('/api/wlan/multi-basic-settings').catch(() => null),
      this.getApi('/api/wlan/multi-basic-settings?snetworkindex=3').catch(() => null),
      this.getApi('/api/wlan/host-list').catch(() => null),
    ]);
    const routerName = firstText(devInfo?.response?.DeviceName || devInfo?.DeviceName || status?.response?.DeviceName);
    const model = firstText(devInfo?.response?.DeviceName || devInfo?.DeviceName) || 'H122-373';
    const firmwareVersion = firstText(devInfo?.response?.SoftwareVersion || devInfo?.SoftwareVersion);
    const imei = firstText(devInfo?.response?.Imei || devInfo?.Imei || devInfo?.response?.Imei);
    const imsi = firstText(devInfo?.response?.Imsi || devInfo?.Imsi);
    const iccid = firstText(status?.response?.Iccid || status?.Iccid);
    const workmode = firstText(status?.response?.WanMode || status?.WanMode);
    const currentRat = mapRat({
      currentNetworkType: firstText(status?.response?.CurrentNetworkType || status?.CurrentNetworkType),
      currentNetworkTypeEx: firstText(status?.response?.CurrentNetworkTypeEx || status?.CurrentNetworkTypeEx),
      rat: firstText(plmn?.response?.Rat || plmn?.Rat),
      workmode,
      endcStatus: firstText(status?.response?.EndcStatus || status?.EndcStatus),
      nrSignalBars: firstText(status?.response?.SignalIconNr || status?.SignalIconNr),
    });
    const operatorShort = firstText(plmn?.response?.ShortName || plmn?.ShortName || status?.response?.FullName);
    const operatorFullname = firstText(plmn?.response?.FullName || plmn?.FullName || status?.response?.FullName);
    const country = firstText(plmn?.response?.Country || plmn?.Country || status?.response?.CountryName);
    const mcc = firstText(plmn?.response?.Mcc || plmn?.Mcc);
    const mnc = firstText(plmn?.response?.Mnc || plmn?.Mnc);
    const cellId = firstText(status?.response?.CellID || status?.CellID);
    const rsrpDbm = toNumber(firstText(signal?.response?.rsrp || signal?.rsrp || monitorStatus?.response?.ZongRsrp));
    const rsrqDb = toNumber(firstText(signal?.response?.rsrq || signal?.rsrq || monitorStatus?.response?.ZongRsrq));
    const sinrDb = toNumber(firstText(signal?.response?.sinr || signal?.sinr || monitorStatus?.response?.ZongSinr));
    const rssiDbm = toNumber(firstText(signal?.response?.rssi || signal?.rssi || monitorStatus?.response?.ZongRssi));
    const bars = normalizeSignalBars(
      currentRat === '5G'
        ? firstText(status?.response?.SignalIconNr || status?.SignalIconNr || status?.response?.SignalIcon)
        : firstText(signal?.response?.SignalIcon || signal?.SignalIcon || status?.response?.SignalIcon),
    );
    const dlMbps = toMbps(firstText(traffic?.response?.CurrentDownloadRate || traffic?.CurrentDownloadRate || monitorStatus?.response?.DlBandwidth));
    const ulMbps = toMbps(firstText(traffic?.response?.CurrentUploadRate || traffic?.CurrentUploadRate || monitorStatus?.response?.UlBandwidth));
    const sessionTime = toNumber(firstText(traffic?.response?.CurrentConnectTime || traffic?.CurrentConnectTime || status?.response?.ConnectionTime || status?.ConnectionTime));
    const totalRx = toNumber(firstText(traffic?.response?.TotalDownload || traffic?.TotalDownload));
    const totalTx = toNumber(firstText(traffic?.response?.TotalUpload || traffic?.TotalUpload));
    const monthRx = toNumber(firstText(monthly?.response?.CurrentMonthDownload || monthly?.CurrentMonthDownload));
    const monthTx = toNumber(firstText(monthly?.response?.CurrentMonthUpload || monthly?.CurrentMonthUpload));
    const simLockStatus = firstText(status?.response?.SimLockStatus || status?.SimLockStatus);
    const wanIp = firstText(status?.response?.WanIPAddress || status?.WanIPAddress || monitorStatus?.response?.IPv4Address);
    const clients = this.parseHostList(wlanHostList);
    const connectedDevicesFallback = toNumber(
      firstText(status?.response?.CurrentWifiUser || status?.CurrentWifiUser),
    );
    const bands24 = this.parseWlanBand(wlanBasic, '2.4G');
    const bands5 = this.parseWlanBand(wlanBasic5g, '5G');
    const bands = [bands24, bands5].filter(Boolean) as WifiBandRuntime[];
    const servingCells = this.buildServingCells({
      currentRat,
      mcc,
      mnc,
      cellId,
      rsrpDbm,
      rsrqDb,
      sinrDb,
      rssiDbm,
      signal,
      status,
    });
    return {
      online: true,
      routerName,
      model,
      firmwareVersion,
      imei,
      imsi,
      iccid,
      simReady:
        toBool(firstText(status?.response?.SimStatus || status?.SimStatus)) ??
        (simLockStatus ? toBool(simLockStatus) === false || /ready|valid|ok/i.test(simLockStatus) : null),
      simSlot: 1,
      currentRat,
      operatorFullname,
      operatorShort,
      country,
      publicIpv4: wanIp || undefined,
      servingCells,
      rsrpDbm,
      rsrqDb,
      sinrDb,
      rssiDbm,
      signalBars: bars,
      downloadMbps: dlMbps,
      uploadMbps: ulMbps,
      sessionTimeSeconds: sessionTime,
      totalRxBytes: totalRx,
      totalTxBytes: totalTx,
      monthRxBytes: monthRx,
      monthTxBytes: monthTx,
      connectedDevices: clients.length > 0 ? clients.length : connectedDevicesFallback,
      bands,
      clients,
      lastSyncAt: new Date().toISOString(),
      extras: {
        workmode,
      },
    };
  }

  private parseWlanBand(payload: any, fallbackBand: '2.4G' | '5G'): WifiBandRuntime | null {
    if (!payload) return null;
    const b24 = Array.isArray(payload?.response?.WifiBasicSettings)
      ? payload?.response?.WifiBasicSettings?.[0]
      : payload?.response?.WifiBasicSettings || payload?.WifiBasicSettings;
    const b = Array.isArray(b24) ? b24[0] : b24;
    const rawBand = firstText(b?.Band || payload?.response?.Band || payload?.Band);
    const ssid = firstText(b?.WifiSsid || payload?.response?.WifiSsid || b?.Ssid || payload?.SSID);
    const enabled =
      toBool(firstText(b?.WifiEnable || payload?.response?.WifiEnable || b?.Enabled)) ??
      Boolean(ssid);
    const channel = toNumber(firstText(b?.WifiChannel || payload?.response?.WifiChannel || b?.Channel));
    const bwRaw = firstText(b?.WifiWide || payload?.response?.WifiWide || b?.Bandwidth || b?.BandwidthMHz);
    const bandwidthMHz = toNumber(bwRaw);
    const security = firstText(b?.WifiAuthmode || payload?.response?.WifiAuthmode || b?.SecurityMode);
    if (!ssid && !enabled && !channel) return null;
    return {
      band: /5|5g|5ghz/i.test(rawBand) ? '5G' : /2\.?4|24/i.test(rawBand) ? '2.4G' : fallbackBand,
      enabled: enabled === null ? true : enabled,
      ssid,
      channel,
      bandwidthMHz,
      security,
    };
  }

  private parseHostList(payload: any): WifiStationClient[] {
    if (!payload) return [];
    const hostsRaw = payload?.response?.Hosts?.Host || payload?.Hosts?.Host || payload?.Host;
    const hosts = Array.isArray(hostsRaw) ? hostsRaw : hostsRaw ? [hostsRaw] : [];
    const out: WifiStationClient[] = [];
    for (const h of hosts) {
      const mac = firstText(h?.MacAddress || h?.Mac).toUpperCase().replace(/[^A-F0-9]/g, '');
      if (mac.length !== 12) continue;
      const macFmt = mac.replace(/(.{2})(?=.)/g, '$1:');
      out.push({
        mac: macFmt,
        hostname: firstText(h?.HostName || h?.Name) || null,
        ip: firstText(h?.IpAddress || h?.IP) || null,
        connectedAt: firstText(h?.AssociatedSsid || h?.ConnectTime) || null,
      });
    }
    return out;
  }

  private buildServingCells(opts: {
    currentRat?: any;
    mcc?: string;
    mnc?: string;
    cellId?: string;
    rsrpDbm?: number | null;
    rsrqDb?: number | null;
    sinrDb?: number | null;
    rssiDbm?: number | null;
    signal?: any;
    status?: any;
  }): FiveGCpeRuntime['servingCells'] {
    const primary = {
      rat: opts.currentRat || null,
      mcc: opts.mcc || null,
      mnc: opts.mnc || null,
      cellId: opts.cellId || null,
      rsrpDbm: opts.rsrpDbm,
      rsrqDb: opts.rsrqDb,
      sinrDb: opts.sinrDb,
      rssiDbm: opts.rssiDbm,
    };
    return [primary];
  }
}
