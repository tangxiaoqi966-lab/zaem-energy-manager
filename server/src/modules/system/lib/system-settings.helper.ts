import type { SystemSettingsData } from '@shared/index';
import prisma from '../../../lib/prisma';
import { DEFAULT_BUSINESS_TIMEZONE } from '../../../lib/business-time';

export const DEFAULT_SETTINGS: SystemSettingsData = {
  alarmRatio80: 0.8,
  alarmRatio90: 0.9,
  alarmRatio95: 0.95,
  autoCutoff: true,
  autoRestorePower: true,
  businessTimezone: DEFAULT_BUSINESS_TIMEZONE,
  refreshInterval: 5000,
  dailyResetHour: 0,
  pricePerKwh: 0.58,
  priceAutoRegion: '',
  priceAutoEnabled: false,
  priceAutoSource: '',
  priceAutoLastUpdatedAt: '',
  defaultDailyLimitKwh: 10,
  defaultMonthlyCostLimitEur: 200,
  defaultDailyLimitUseWeeklyRules: false,
  defaultDailyLimitWeekdayKwh: 10,
  defaultDailyLimitSaturdayKwh: 10,
  defaultDailyLimitSundayKwh: 10,
  defaultDailyLimitUseHolidayRules: false,
  defaultDailyLimitHolidayKwh: 10,
  defaultDailyLimitHolidayDates: '',
};

export type SettingsKey = keyof SystemSettingsData;

export const ALARM_RATIO_KEYS: SettingsKey[] = ['alarmRatio80', 'alarmRatio90', 'alarmRatio95'];

export const BOOLEAN_SETTING_KEYS: SettingsKey[] = [
  'autoCutoff',
  'autoRestorePower',
  'priceAutoEnabled',
  'defaultDailyLimitUseWeeklyRules',
  'defaultDailyLimitUseHolidayRules',
];

export const STRING_SETTING_KEYS: SettingsKey[] = [
  'businessTimezone',
  'priceAutoRegion',
  'priceAutoSource',
  'priceAutoLastUpdatedAt',
  'defaultDailyLimitHolidayDates',
];

export const PRICE_AUTO_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const ELECTRICITY_PRICE_REFERENCE_MAP: Array<{
  region: string;
  pricePerKwh: number;
  keywords: string[];
}> = [
  { region: '奥地利', pricePerKwh: 0.32, keywords: ['austria', 'osterreich', 'österreich', 'vienna', 'wien', 'europe/vienna'] },
  { region: '德国', pricePerKwh: 0.40, keywords: ['germany', 'deutschland', 'berlin', 'europe/berlin'] },
  { region: '法国', pricePerKwh: 0.29, keywords: ['france', 'paris', 'europe/paris'] },
  { region: '意大利', pricePerKwh: 0.31, keywords: ['italy', 'italia', 'rome', 'europe/rome'] },
  { region: '西班牙', pricePerKwh: 0.27, keywords: ['spain', 'espana', 'españa', 'madrid', 'europe/madrid'] },
  { region: '葡萄牙', pricePerKwh: 0.25, keywords: ['portugal', 'lisbon', 'europe/lisbon'] },
  { region: '荷兰', pricePerKwh: 0.32, keywords: ['netherlands', 'holland', 'amsterdam', 'europe/amsterdam'] },
  { region: '比利时', pricePerKwh: 0.35, keywords: ['belgium', 'brussels', 'europe/brussels'] },
  { region: '瑞士', pricePerKwh: 0.30, keywords: ['switzerland', 'zurich', 'geneva', 'europe/zurich'] },
  { region: '爱尔兰', pricePerKwh: 0.37, keywords: ['ireland', 'dublin', 'europe/dublin'] },
  { region: '英国', pricePerKwh: 0.31, keywords: ['uk', 'united kingdom', 'britain', 'london', 'europe/london'] },
  { region: '瑞典', pricePerKwh: 0.20, keywords: ['sweden', 'stockholm', 'europe/stockholm'] },
  { region: '挪威', pricePerKwh: 0.18, keywords: ['norway', 'oslo', 'europe/oslo'] },
  { region: '芬兰', pricePerKwh: 0.19, keywords: ['finland', 'helsinki', 'europe/helsinki'] },
  { region: '丹麦', pricePerKwh: 0.31, keywords: ['denmark', 'copenhagen', 'europe/copenhagen'] },
  { region: '波兰', pricePerKwh: 0.24, keywords: ['poland', 'warsaw', 'europe/warsaw'] },
  { region: '捷克', pricePerKwh: 0.22, keywords: ['czech', 'prague', 'europe/prague'] },
  { region: '斯洛伐克', pricePerKwh: 0.21, keywords: ['slovakia', 'bratislava', 'europe/bratislava'] },
  { region: '匈牙利', pricePerKwh: 0.15, keywords: ['hungary', 'budapest', 'europe/budapest'] },
  { region: '罗马尼亚', pricePerKwh: 0.18, keywords: ['romania', 'bucharest', 'europe/bucharest'] },
  { region: '克罗地亚', pricePerKwh: 0.20, keywords: ['croatia', 'zagreb', 'europe/zagreb'] },
  { region: '斯洛文尼亚', pricePerKwh: 0.21, keywords: ['slovenia', 'ljubljana', 'europe/ljubljana'] },
  { region: '中国', pricePerKwh: 0.08, keywords: ['china', 'shanghai', 'beijing', 'asia/shanghai'] },
];

export function isAlarmRatioKey(key: SettingsKey): boolean {
  return ALARM_RATIO_KEYS.includes(key);
}

export function normalizeAlarmRatioValue(value: string | number): number {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numValue)) return 0;
  return numValue > 1 ? numValue / 100 : numValue;
}

export function normalizeRefreshIntervalValue(value: string | number): number {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numValue) || numValue <= 0) return DEFAULT_SETTINGS.refreshInterval;
  if (numValue < 1000) return numValue * 1000;
  const allowed = [5000, 10000, 15000, 30000];
  return allowed.find((item) => item === numValue) ?? DEFAULT_SETTINGS.refreshInterval;
}

export function normalizeLookupText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ');
}

export async function loadSettingsFromDb(defaults: SystemSettingsData = DEFAULT_SETTINGS): Promise<SystemSettingsData> {
  const rows = await prisma.systemSettings.findMany();
  const data: Record<string, unknown> = { ...defaults as unknown as Record<string, unknown> };
  for (const row of rows) {
    const key = row.key as SettingsKey;
    if (!(key in defaults)) continue;
    const raw = row.value;
    if (ALARM_RATIO_KEYS.includes(key)) {
      data[key] = normalizeAlarmRatioValue(raw);
      continue;
    }
    if (BOOLEAN_SETTING_KEYS.includes(key)) {
      data[key] = raw === 'true' || raw === '1';
      continue;
    }
    if (STRING_SETTING_KEYS.includes(key)) {
      data[key] = typeof raw === 'string' ? raw : String(raw ?? '');
      continue;
    }
    if (key === 'refreshInterval') {
      data.refreshInterval = normalizeRefreshIntervalValue(raw);
      continue;
    }
    if (key === 'dailyResetHour') {
      const n = Number(raw);
      data.dailyResetHour = Number.isInteger(n) && n >= 0 && n <= 23 ? n : defaults.dailyResetHour;
      continue;
    }
    const numeric = Number(raw);
    data[key] = Number.isFinite(numeric) ? numeric : (defaults as unknown as Record<string, unknown>)[key];
  }
  return data as unknown as SystemSettingsData;
}

export async function persistSettingsPartial(
  partial: Partial<SystemSettingsData>,
): Promise<void> {
  if (!partial || Object.keys(partial).length === 0) return;
  const now = new Date();
  await Promise.all(
    Object.entries(partial).map(async ([rawKey, rawValue]) => {
      const key = rawKey as SettingsKey;
      let textValue: string;
      if (ALARM_RATIO_KEYS.includes(key)) {
        textValue = String(normalizeAlarmRatioValue(rawValue as string | number));
      } else if (BOOLEAN_SETTING_KEYS.includes(key)) {
        textValue = rawValue === true ? 'true' : 'false';
      } else if (STRING_SETTING_KEYS.includes(key)) {
        textValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
      } else if (key === 'refreshInterval') {
        textValue = String(normalizeRefreshIntervalValue(rawValue as string | number));
      } else if (key === 'dailyResetHour') {
        const n = Number(rawValue);
        textValue = String(Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_SETTINGS.dailyResetHour);
      } else if (typeof rawValue === 'number') {
        textValue = String(rawValue);
      } else {
        textValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
      }
      await prisma.systemSettings.upsert({
        where: { key },
        create: { key, value: textValue, updatedAt: now },
        update: { value: textValue, updatedAt: now },
      });
    }),
  );
}

export function resolveReferenceElectricityPrice(input?: {
  region?: string | null;
  businessTimezone?: string | null;
  priceAutoSource?: string | null;
}): { region: string; pricePerKwh: number } {
  const price = (DEFAULT_SETTINGS as SystemSettingsData).pricePerKwh;
  const lookup = normalizeLookupText(
    input?.region ?? null,
    input?.businessTimezone ?? null,
    input?.priceAutoSource ?? null,
  );
  const hit = ELECTRICITY_PRICE_REFERENCE_MAP.find(
    (entry) => entry.keywords.some((kw) => lookup.includes(kw)),
  );
  return hit
    ? { region: hit.region, pricePerKwh: hit.pricePerKwh }
    : { region: '德国 (默认)', pricePerKwh: price };
}
