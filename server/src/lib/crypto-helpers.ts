import * as crypto from 'crypto';

export function sha256Base64(input: Buffer): string {
  return crypto.createHash('sha256').update(input).digest('base64');
}

export function hmacSha256Base64(key: Buffer, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest().toString('base64');
}

export function toQueryString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => {
      const value = params[k];
      const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join('&');
}

export function generateNonce(): string {
  const minutes = Math.floor(Date.now() / 60000);
  const randomPart = crypto.randomBytes(8);
  const minuteBuf = Buffer.alloc(4);
  minuteBuf.writeUInt32BE(minutes);
  return Buffer.concat([randomPart, minuteBuf]).toString('base64');
}
