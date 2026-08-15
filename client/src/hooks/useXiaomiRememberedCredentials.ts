import { useCallback, useEffect, useState } from 'react';

type XiaomiScope = 'main' | 'camera';

interface RememberedXiaomiCredentials {
  username: string;
  password: string;
  region: string;
  enabled: boolean;
}

const KEY = (scope: XiaomiScope) => `zaem:xiaomi:remember:${scope}` as const;

function safeRead(scope: XiaomiScope): RememberedXiaomiCredentials {
  if (typeof window === 'undefined') {
    return { username: '', password: '', region: scope === 'camera' ? 'de' : 'cn', enabled: true };
  }
  try {
    const raw = window.localStorage.getItem(KEY(scope));
    if (!raw) {
      return { username: '', password: '', region: scope === 'camera' ? 'de' : 'cn', enabled: true };
    }
    const parsed = JSON.parse(raw) as Partial<RememberedXiaomiCredentials>;
    return {
      username: typeof parsed?.username === 'string' ? parsed.username : '',
      password: typeof parsed?.password === 'string' ? parsed.password : '',
      region:
        typeof parsed?.region === 'string' && parsed.region.trim()
          ? parsed.region.trim()
          : scope === 'camera'
            ? 'de'
            : 'cn',
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : true,
    };
  } catch {
    return { username: '', password: '', region: scope === 'camera' ? 'de' : 'cn', enabled: true };
  }
}

function safeWrite(scope: XiaomiScope, value: RememberedXiaomiCredentials) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(scope), JSON.stringify(value));
  } catch {
    /* storage disabled, ignore */
  }
}

export function useXiaomiRememberedCredentials(scope: XiaomiScope) {
  const [value, setValue] = useState<RememberedXiaomiCredentials>(() => safeRead(scope));

  useEffect(() => {
    setValue(safeRead(scope));
  }, [scope]);

  const persist = useCallback(
    (next: Partial<RememberedXiaomiCredentials>) => {
      setValue((prev) => {
        const merged: RememberedXiaomiCredentials = { ...prev, ...next };
        if (!merged.enabled) {
          safeWrite(scope, { username: '', password: '', region: merged.region, enabled: false });
          return { ...merged, username: '', password: '' };
        }
        safeWrite(scope, merged);
        return merged;
      });
    },
    [scope],
  );

  const clear = useCallback(() => {
    setValue((prev) => {
      const cleared: RememberedXiaomiCredentials = {
        username: '',
        password: '',
        region: prev.region,
        enabled: false,
      };
      safeWrite(scope, cleared);
      return cleared;
    });
  }, [scope]);

  return { credentials: value, persist, clear } as const;
}
