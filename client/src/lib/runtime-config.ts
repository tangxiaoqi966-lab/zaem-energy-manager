export interface RuntimeConfig {
  apiBaseUrl?: string;
  socketUrl?: string;
  socketPath?: string;
}

type RuntimeWindow = Window & {
  __ZAEM_RUNTIME_CONFIG__?: RuntimeConfig;
};

function getRuntimeWindow(): RuntimeWindow {
  return window as RuntimeWindow;
}

export function getRuntimeConfig(): RuntimeConfig {
  return getRuntimeWindow().__ZAEM_RUNTIME_CONFIG__ ?? {};
}

function isZhiraiHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return (
    host === 'zhirai.cloud' ||
    host === 'www.zhirai.cloud' ||
    host === 'api.zhirai.cloud'
  );
}

function getDefaultApiBaseUrl(): string {
  return isZhiraiHost() ? 'https://api.zhirai.cloud/zaem-api' : '/api';
}

function getDefaultSocketPath(): string {
  return isZhiraiHost() ? '/zaem-socket.io' : '/socket.io';
}

export function getApiBaseUrl(): string {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  return import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl();
}

export function getSocketPath(): string {
  const runtimeConfig = getRuntimeConfig();
  return runtimeConfig.socketPath || import.meta.env.VITE_SOCKET_PATH || getDefaultSocketPath();
}

export function getSocketUrl(): string {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.socketUrl) {
    return runtimeConfig.socketUrl;
  }

  if (isZhiraiHost()) {
    return 'https://api.zhirai.cloud';
  }

  if (runtimeConfig.apiBaseUrl) {
    try {
      return new URL(runtimeConfig.apiBaseUrl, window.location.origin).origin;
    } catch {
    }
  }

  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl) {
    return explicitSocketUrl;
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (apiBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl, window.location.origin);
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return apiUrl.origin;
      }
    } catch {
    }
  }

  return '/';
}
