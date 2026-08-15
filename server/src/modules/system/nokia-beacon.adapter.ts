import * as crypto from 'crypto';
import type {
  WifiApRuntime,
  WifiBandRuntime,
  WifiStationClient,
  MeshNodeRuntime,
} from '@shared/index';

export interface NokiaBeaconCredentials {
  baseUrl: string;
  username?: string | null;
  password?: string | null;
  sessionSid?: string | null;
}

const DEFAULT_TIMEOUT_MS = 15000;

export class NokiaBeaconAdapter {
  private sessionSid: string = '';
  private token: string = '';
  private expiresAt: number = 0;

  constructor(private readonly credentials: NokiaBeaconCredentials) {
    if (!credentials?.baseUrl) throw new Error('Nokia Beacon baseUrl 不能为空');
  }

  private baseUrl(): string {
    return this.credentials.baseUrl.replace(/\/+$/, '');
  }

  private host(): string {
    try { return new URL(this.baseUrl()).hostname; } catch { return ''; }
  }

  private async rawFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; text: string; json?: any; headers: Headers }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
        Origin: this.baseUrl(),
        Referer: this.baseUrl() + '/web_whw/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      };
      if (this.sessionSid) headers['Cookie'] = `sid=${this.sessionSid}`;
      if (init.headers) Object.assign(headers, init.headers as Record<string, string>);
      const resp = await fetch(this.baseUrl() + path, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: 'manual',
      });
      const text = await resp.text();
      let json: any = undefined;
      try { json = JSON.parse(text); } catch { /* ignore */ }
      const xSid = (resp.headers as any).get?.('x-sid');
      if (xSid && typeof xSid === 'string') { this.sessionSid = String(xSid); }
      return { ok: resp.ok, status: resp.status, text, json, headers: resp.headers as Headers };
    } finally {
      clearTimeout(timer);
    }
  }

  private async nonceLogin(): Promise<void> {
    const username = this.credentials.username || 'admin';
    const password = String(this.credentials.password ?? '');
    if (!password) throw new Error('Beacon 1 管理员密码不能为空（或在详情抽屉填入 sessionSid 直接复用 Web 登录态）');

    const step1 = await this.rawFetch('/login_web_app.cgi?nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `userName=${encodeURIComponent(username)}`,
    });
    if (!step1.json?.nonce || !step1.json?.randomKey) {
      throw new Error(
        `Beacon 1 取 nonce 失败：status=${step1.status} body=${String(step1.text || '').slice(0, 200)}`,
      );
    }
    const nonce: string = String(step1.json.nonce);
    const randomKey: string = String(step1.json.randomKey);
    const pubkey: string | undefined = step1.json.pubkey;

    const userhash = this.sha256Crypt(`${username}:${password}`, nonce);
    const randomKeyhash = this.sha256Crypt(`${password}${randomKey}`, nonce);
    const response = this.sha256Crypt(`${password}${nonce}`, randomKey);
    const enckey = this.urlsafeB64(crypto.randomBytes(16), true);
    const enciv = this.urlsafeB64(crypto.randomBytes(16), true);
    const nohash = '0';
    const nonceForm = nonce
      .replace(/\+/g, '.')
      .replace(/\//g, '_')
      .replace(/=+$/g, m => '.'.repeat(m.length));
    const form = new URLSearchParams({
      userhash,
      RandomKeyhash: randomKeyhash,
      response,
      nonce: nonceForm,
      enckey,
      enciv,
      nohash,
    }).toString();

    const login = await this.rawFetch('/login_web_app.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const sid = login.json?.sid || (login.headers as any).get?.('x-sid') || '';
    const tok = login.json?.token || '';
    if (!sid) {
      const bodyHead = String(login.text || '').slice(0, 400);
      throw new Error(
        `Beacon 1 登录协议校验未通过（sha256crypt 算法待验证）。请先用浏览器成功登录 WebUI，然后在详情抽屉的「sessionSid」填入最新 sid，或稍后等登录算法补全。status=${login.status} body=${bodyHead}`,
      );
    }
    this.sessionSid = String(sid);
    if (tok) this.token = String(tok);
  }

  private sha256Crypt(phrase: string, salt: string): string {
    const s = crypto
      .createHash('sha256')
      .update(`${phrase}${salt}`, 'utf8')
      .digest();
    return this.urlsafeB64(s, true);
  }

  private urlsafeB64(buf: Buffer, shortPad = false): string {
    const base = buf.toString('base64')
      .replace(/\+/g, '.')
      .replace(/\//g, '_');
    if (shortPad) return base.replace(/=+$/g, m => '.'.repeat(m.length));
    return base;
  }

  public async ensureSession(): Promise<void> {
    if (this.credentials.sessionSid) {
      this.sessionSid = String(this.credentials.sessionSid);
    }
    if (this.expiresAt > Date.now() + 30_000 && this.sessionSid) {
      try { await this.probeAlive(); return; } catch { /* fallthrough re-login */ }
    }
    if (this.sessionSid) {
      try {
        await this.probeAlive();
        this.expiresAt = Date.now() + 240 * 1000;
        return;
      } catch {
        this.sessionSid = '';
      }
    }
    try {
      await this.nonceLogin();
      this.expiresAt = Date.now() + 240 * 1000;
    } catch (e) {
      if (this.credentials.sessionSid) {
        this.sessionSid = String(this.credentials.sessionSid);
        try { await this.probeAlive(); this.expiresAt = Date.now() + 240 * 1000; return; } catch { /* ignore */ }
      }
      throw e;
    }
  }

  private async probeAlive(): Promise<void> {
    const r = await this.rawFetch('/check_expire_web_app.cgi', { method: 'GET' });
    const expired = String(r.json?.expired || r.text || '');
    if (/^no$/i.test(expired) || r.json?.gwready === '1' || r.json?.gwready === 1) return;
    if (r.status >= 300 && r.status < 400) throw new Error('session 已失效或未登录（302 跳登录页）');
    if (r.status !== 200) throw new Error(`check_expire 异常 status=${r.status}`);
  }

  public async fetchStatus(): Promise<WifiApRuntime> {
    return this.fetchMeshStatus();
  }

  public async fetchMeshStatus(): Promise<WifiApRuntime> {
    await this.ensureSession();
    const [ds, dds, topo] = await Promise.all([
      this.get('/dashboard_status_web_app.cgi'),
      this.get('/dashboard_device_status_web_app.cgi'),
      this.get('/dashboard_ntwtopo_status_web_app.cgi'),
    ]);

    const wan = ds?.Wan_status || {};
    const wifi24Enabled = String(wan?.['WIFI_2.4GHZ'] || wan?.WIFI_2_4GHZ || '') === 'Enabled';
    const wifi5Enabled = String(wan?.['WIFI_5GHZ'] || '') === 'Enabled';
    const lanIp = (ds?.lan_status?.[0]?.IPInterfaceIPAddress as string | undefined) || this.host() || null;

    const deviceList: Array<{
      _oid?: number | string; HostName?: string; IPAddress?: string;
      MACAddress?: string; InterfaceType?: string;
    }> = Array.isArray(ds?.Device_list) ? ds.Device_list : [];
    const deviceCfg: Array<{
      _oid?: number | string; HostName?: string; SSIDInterface?: number | string;
      Active?: number | string; X_ALU_COM_IsBeacon?: number | string;
    }> = Array.isArray(dds?.device_cfg) ? dds.device_cfg : [];
    const ntwTopo: Array<{
      HostName?: string; isOnline?: string; IPAddress?: string;
      SerialNumber?: string; BackhaulStatus?: string;
      OnboardStatus?: string; MACAddress?: string;
    }> = Array.isArray(topo?.ntwtopo_cfg) ? topo.ntwtopo_cfg : [];

    const byOid = new Map<string, (typeof deviceCfg)[number]>();
    for (const c of deviceCfg) { if (c._oid != null) byOid.set(String(c._oid), c); }

    const client24Active = deviceCfg.filter(c => (c.SSIDInterface === '0' || c.SSIDInterface === 0) && String(c.Active) === '1').length;
    const client5Active = deviceCfg.filter(c => (c.SSIDInterface === '1' || c.SSIDInterface === '5' || c.SSIDInterface === 1 || c.SSIDInterface === 5) && String(c.Active) === '1').length;

    const bands: WifiBandRuntime[] = [];
    bands.push({
      band: '2.4G',
      enabled: wifi24Enabled,
      ssid: 'Beacon 1 2.4G Mesh',
      channel: null,
      bandwidthMHz: null,
      security: null,
      txRateMbps: null,
      rxRateMbps: null,
      txPowerDbm: null,
      clientCount: client24Active,
    });
    bands.push({
      band: '5G',
      enabled: wifi5Enabled,
      ssid: 'Beacon 1 5G Mesh',
      channel: null,
      bandwidthMHz: null,
      security: null,
      txRateMbps: null,
      rxRateMbps: null,
      txPowerDbm: null,
      clientCount: client5Active,
    });

    const seenClients = new Map<string, WifiStationClient>();
    for (const raw of deviceList) {
      const macRaw = String(raw.MACAddress || '').toUpperCase().replace(/[^A-F0-9]/g, '');
      if (macRaw.length !== 12) continue;
      const mac = macRaw.slice(0, 2) + ':' + macRaw.slice(2, 4) + ':' + macRaw.slice(4, 6) + ':' + macRaw.slice(6, 8) + ':' + macRaw.slice(8, 10) + ':' + macRaw.slice(10, 12);
      const oid = String(raw._oid ?? '');
      const cfg = oid ? byOid.get(oid) : undefined;
      const ssidIf = cfg?.SSIDInterface;
      let bandVal: WifiStationClient['band'] = null;
      if (ssidIf === '0' || ssidIf === 0) bandVal = '2.4G';
      else if (ssidIf === '1' || ssidIf === 1 || ssidIf === '5' || ssidIf === 5) bandVal = '5G';
      const active = cfg ? String(cfg.Active) === '1' : true;
      if (seenClients.has(mac)) continue;
      seenClients.set(mac, {
        mac,
        hostname: raw.HostName ? String(raw.HostName) : null,
        ip: raw.IPAddress ? String(raw.IPAddress) : null,
        band: bandVal,
        interfaceType: raw.InterfaceType ? String(raw.InterfaceType) : null,
        active,
        rxBytes: null as any,
        txBytes: null as any,
        connectedAt: null,
      });
    }
    const clients = Array.from(seenClients.values());

    const nodes: Array<MeshNodeRuntime & { _nodeId: string }> = [];
    let rootIdx = -1;
    for (let i = 0; i < ntwTopo.length; i += 1) {
      const n = ntwTopo[i];
      const macRaw = String(n.MACAddress || '').toUpperCase().replace(/[^A-F0-9]/g, '');
      const mac = macRaw.length === 12
        ? macRaw.slice(0, 2) + ':' + macRaw.slice(2, 4) + ':' + macRaw.slice(4, 6) + ':' + macRaw.slice(6, 8) + ':' + macRaw.slice(8, 10) + ':' + macRaw.slice(10, 12)
        : '';
      const roleRaw = String(n.OnboardStatus || '').toLowerCase();
      const isRoot = roleRaw === 'root_ap';
      if (isRoot) rootIdx = i;
      const role: MeshNodeRuntime['role'] = isRoot ? 'master' : 'satellite';
      const online = String(n.isOnline || '') === '1';
      const bh = String(n.BackhaulStatus || '').toUpperCase();
      const backhaulType: MeshNodeRuntime['backhaulType'] = bh === 'GOOD' ? (isRoot ? 'ethernet' : 'wifi_5G') : bh === 'NORMAL' ? 'wifi_5G' : bh === 'BAD' ? 'plc' : null;
      const nodeName = String(n.HostName || (isRoot ? 'Beacon 1 主控（ROOT_AP）' : `Beacon 1 Mesh 子节点 ${i}`)) + (isRoot ? ' [Mesh 主]' : ' [Mesh 子]');
      nodes.push({
        _nodeId: String(n.SerialNumber || n.MACAddress || `node-${i}`),
        nodeId: String(n.SerialNumber || n.MACAddress || `node-${i}`),
        nodeName,
        role,
        online,
        ip: n.IPAddress ? String(n.IPAddress) : null,
        mac: mac || null,
        model: 'Beacon 1 HA-020W-B',
        vendor: 'Nokia',
        parentNodeId: isRoot ? undefined : (rootIdx >= 0 ? String(ntwTopo[rootIdx]?.SerialNumber || ntwTopo[rootIdx]?.MACAddress || 'master') : undefined),
        backhaulType,
        backhaulRateMbps: null,
        backhaulRssiDbm: null,
        uptimeSeconds: null,
        lastSeenAt: online ? new Date().toISOString() : null,
        firmware: null,
        bands,
        totalClientCount: clients.filter(c => c.active).length,
      });
    }
    if (!nodes.length) {
      nodes.push({
        _nodeId: 'beacon1-main',
        nodeId: 'beacon1-main',
        nodeName: 'Beacon 1 主控（ROOT_AP）[Mesh 主]',
        role: 'master',
        online: true,
        ip: lanIp,
        mac: null,
        model: 'HA-020W-B',
        vendor: 'Nokia',
        bands,
        totalClientCount: clients.length,
        lastSeenAt: new Date().toISOString(),
      });
    }

    const activeClients = clients.filter(c => c.active !== false).length;
    return {
      ssid: 'Beacon 1 Mesh（双频）',
      band: wifi24Enabled && wifi5Enabled ? '2.4G+5G' : (wifi24Enabled ? '2.4G' : (wifi5Enabled ? '5G' : null)),
      channel: null,
      signalDbm: null,
      clients,
      clientCount: activeClients || clients.length,
      lastSeenAt: new Date().toISOString(),
      bands,
      meshTopology: nodes,
      meshBackhaulState: nodes.every(n => n.online)
        ? 'up'
        : nodes.some(n => n.online)
          ? 'degraded'
          : 'down',
      totalRxBytes: undefined,
      totalTxBytes: undefined,
      uptimeSeconds: null,
    };
  }

  private async get(path: string): Promise<any> {
    const r = await this.rawFetch(path, { method: 'GET' });
    if (r.status >= 300 && r.status < 400) {
      throw new Error(`Beacon 1 GET ${path} 302，session 未登录或失效`);
    }
    if (r.json != null) return r.json;
    try { return JSON.parse(r.text); } catch { return r.text; }
  }
}
