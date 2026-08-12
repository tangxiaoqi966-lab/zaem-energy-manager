import { Request } from 'express';
import geoip from 'geoip-lite';
import { OperationActorContext, OperationSource, getOperationSourceLabel } from './operation-log';

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }

  const first = ip.split(',')[0]?.trim() || '';
  if (!first) {
    return null;
  }

  return first.replace(/^::ffff:/, '');
}

function detectOperationSource(userAgent: string | null | undefined): OperationSource {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) {
    return 'unknown';
  }

  const isBrowser = /mozilla|chrome|safari|firefox|edg\//i.test(ua);
  const isMobile = /android|iphone|ipad|mobile|harmonyos/i.test(ua);
  const isApp = /okhttp|cfnetwork|dart|flutter|micromessenger|postmanruntime/i.test(ua);

  if (isBrowser && isMobile) {
    return 'web_mobile';
  }
  if (isBrowser) {
    return 'web_desktop';
  }
  if (isApp) {
    return 'mobile_app';
  }
  return 'api_client';
}

function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip) {
    return false;
  }

  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function getGeoLabel(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildLocationLabel(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }

  if (isPrivateIp(ip)) {
    return `本地 / 局域网 (${ip})`;
  }

  const geo = geoip.lookup(ip);
  if (!geo) {
    return ip;
  }

  const country = getGeoLabel(geo.country);
  const city = getGeoLabel(geo.city);

  if (country && city) {
    return `${country} / ${city} (${ip})`;
  }

  if (country) {
    return `${country} (${ip})`;
  }

  if (city) {
    return `${city} (${ip})`;
  }

  return ip;
}

function buildDeviceLabel(userAgent: string | null | undefined): string | null {
  const ua = String(userAgent || '');
  if (!ua) {
    return null;
  }

  const lower = ua.toLowerCase();
  const platform = /iphone|ipad|ios/i.test(ua)
    ? 'iPhone/iPad'
    : /android/i.test(ua)
      ? 'Android'
      : /windows/i.test(ua)
        ? 'Windows'
        : /macintosh|mac os/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : '未知系统';

  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome\//i.test(ua)
      ? 'Chrome'
      : /firefox\//i.test(ua)
        ? 'Firefox'
        : /safari\//i.test(ua) && !/chrome\//i.test(ua)
          ? 'Safari'
          : /okhttp/i.test(lower)
            ? 'OkHttp'
            : /postmanruntime/i.test(lower)
              ? 'Postman'
              : /dart|flutter/i.test(lower)
                ? 'Flutter/Dart'
                : '未知客户端';

  return `${platform} / ${browser}`;
}

export function getOperationActorContextFromRequest(req: Request): OperationActorContext {
  const userAgent = (req.headers['user-agent'] as string | undefined) || null;
  const source = detectOperationSource(userAgent);
  const ip =
    normalizeIp(req.headers['cf-connecting-ip'] as string | undefined) ||
    normalizeIp(req.headers['x-forwarded-for'] as string | undefined) ||
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress);

  return {
    source,
    sourceLabel: getOperationSourceLabel(source) || undefined,
    ip,
    locationLabel: buildLocationLabel(ip),
    userAgent,
    deviceLabel: buildDeviceLabel(userAgent),
  };
}
