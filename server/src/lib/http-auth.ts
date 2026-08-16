import * as crypto from 'crypto';

export type HttpAuthType = 'digest' | 'basic' | 'none';

export function normalizeAuthType(raw: unknown): HttpAuthType {
  if (typeof raw !== 'string') return 'digest';
  const v = raw.trim().toLowerCase();
  if (v === 'basic') return 'basic';
  if (v === 'none') return 'none';
  return 'digest';
}

export function buildBasicAuthToken(username: string, password = ''): string {
  return Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
}

export function buildBasicAuthHeader(username: string, password = ''): string {
  return `Basic ${buildBasicAuthToken(username, password)}`;
}

function md5Hex(s: string): string {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

function parseWwwAuthenticateKv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z]+)=("[^"]*"|[^,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const k = m[1];
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

export function buildDigestAuthHeader(
  method: string,
  url: string,
  username: string,
  password: string,
  wwwAuthenticate: string,
  nc = '00000001',
  cnonce = Math.random().toString(16).slice(2, 10),
): string {
  const kv = parseWwwAuthenticateKv(wwwAuthenticate);
  const realm = kv.realm || '';
  const nonce = kv.nonce || '';
  const qop = kv.qop || '';
  const opaque = kv.opaque || '';
  const algo = (kv.algorithm || 'MD5').toUpperCase();
  let pathname = '/';
  try {
    const parsedUrl = new URL(url);
    pathname = parsedUrl.pathname + (parsedUrl.search || '');
  } catch {
    pathname = '/';
  }

  const ha1 =
    algo === 'MD5-Sess'
      ? md5Hex(`${md5Hex(`${username}:${realm}:${password}`)}:${nonce}:${cnonce}`)
      : md5Hex(`${username}:${realm}:${password}`);
  const ha2 = md5Hex(`${method}:${pathname}`);
  const qopList = qop ? qop.split(',').map((s) => s.trim()) : [];
  const hasAuthQop = qopList.includes('auth');
  const response = hasAuthQop
    ? md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
    : qop
      ? md5Hex(`${ha1}:${nonce}:${ha2}`)
      : md5Hex(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${pathname}"`,
    `response="${response}"`,
  ];
  if (opaque) parts.push(`opaque="${opaque}"`);
  if (algo) parts.push(`algorithm=${algo}`);
  if (qop) {
    const useQop = hasAuthQop ? 'auth' : qopList[0] || qop;
    parts.push(`qop=${useQop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}
