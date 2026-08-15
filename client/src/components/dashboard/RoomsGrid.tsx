import { useMemo, useState } from 'react';
import RoomCard from './RoomCard';
import type { DeviceItem, RoomStatus, DeviceCategory as DeviceCategoryEnum } from '../../types';
import { DEVICE_CATEGORY_LABEL } from '../../types';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';

export interface DashboardSpaceCard {
  key: string;
  title: string;
  subtitle: string;
  idHint: string;
  roomId: string | null;
  roomNumber: string | null;
  roomAnnotation: string | null;
  floor: number;
  status: RoomStatus;
  power: number;
  todayUsage: number;
  monthUsage: number;
  monthCost: number;
  cumulativeUsage: number;
  usagePercent: number;
  dailyLimit: number | null;
  limitEnabled: boolean;
  monthlyCostLimit: number | null;
  costLimitEnabled: boolean;
  cutoff: boolean;
  deviceOnline: boolean | number;
  powerActionCooldownUntil: string | null;
  powerActionRetryAfterSeconds: number;
  powerActionLastType: 'cutoff_power' | 'restore_power' | null;
  devices: DeviceItem[];
  mapped: boolean;
  publicFacility?: boolean;
}

interface RoomsGridProps {
  rooms: DashboardSpaceCard[];
  pricePerKwh: number;
  flatMode?: boolean;
}

const FLOOR_LABEL_PREFIX = '';
const CATEGORY_ORDER: DeviceCategoryEnum[] = [
  'circuit_breaker' as DeviceCategoryEnum,
  'camera' as DeviceCategoryEnum,
  'wifi_ap' as DeviceCategoryEnum,
  'five_g_cpe' as DeviceCategoryEnum,
  'smart_appliance' as DeviceCategoryEnum,
  'other' as DeviceCategoryEnum,
];

function floorToEuropeanLabel(floor: number | null | undefined): string {
  if (floor == null || !Number.isFinite(floor)) return 'Unbekannt';
  if (floor < 0) return `UG ${Math.abs(floor)}`;
  if (floor === 0) return 'EG';
  return `${floor}. OG`;
}

function formatFloorLabel(floor: number | null | undefined): string {
  return floorToDualLabel(floor);
}

export function floorToDualLabel(floor: number | null | undefined): string {
  const eu = floorToEuropeanLabel(floor);
  if (floor == null || !Number.isFinite(floor)) return eu;
  let cn: string;
  if (floor < 0) cn = `地下${Math.abs(floor)}层`;
  else if (floor === 0) cn = '地面层';
  else cn = `${floor + 1}层`;
  return `${eu} · ${cn}`;
}

function summarizeCategoryCounts(cards: DashboardSpaceCard[]): Record<DeviceCategoryEnum, number> {
  const counts: Record<string, number> = {
    circuit_breaker: 0,
    camera: 0,
    wifi_ap: 0,
    five_g_cpe: 0,
    smart_appliance: 0,
    other: 0,
  };
  for (const card of cards) {
    if (!card.devices?.length) {
      counts.other += 0;
      continue;
    }
    const seen = new Set<string>();
    for (const d of card.devices) {
      if (seen.has(d.id ?? d.did)) continue;
      seen.add(d.id ?? d.did);
      const cat = String((d as any).category ?? 'other') as DeviceCategoryEnum;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
  }
  return counts as Record<DeviceCategoryEnum, number>;
}

function formatCategorySummary(counts: Record<DeviceCategoryEnum, number>): string {
  const parts: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const n = counts[cat] ?? 0;
    if (n <= 0) continue;
    parts.push(`${DEVICE_CATEGORY_LABEL[cat] ?? cat} ${n}`);
  }
  return parts.join(' · ');
}

function totalDeviceCount(counts: Record<DeviceCategoryEnum, number>): number {
  let total = 0;
  for (const n of Object.values(counts)) total += Number(n) || 0;
  return total;
}

function groupCardsByPrimaryCategory(
  cards: DashboardSpaceCard[]
): Map<DeviceCategoryEnum, DashboardSpaceCard[]> {
  const byCat = new Map<DeviceCategoryEnum, DashboardSpaceCard[]>();
  for (const card of cards) {
    const primary = pickPrimaryCategory(card.devices);
    const list = byCat.get(primary) ?? [];
    list.push(card);
    byCat.set(primary, list);
  }
  return byCat;
}

function pickPrimaryCategory(devices: DeviceItem[] | null | undefined): DeviceCategoryEnum {
  if (!devices || !devices.length) return 'other' as DeviceCategoryEnum;
  const counts: Record<string, number> = {};
  for (const d of devices) {
    const cat = String((d as any).category ?? 'other') as DeviceCategoryEnum;
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  let best: DeviceCategoryEnum = 'other' as DeviceCategoryEnum;
  let bestCount = -1;
  for (const cat of CATEGORY_ORDER) {
    const n = counts[cat] ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = cat;
    }
  }
  if (bestCount <= 0) return 'other' as DeviceCategoryEnum;
  return best;
}

function presentCategories(counts: Record<DeviceCategoryEnum, number>): DeviceCategoryEnum[] {
  const present = CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0);
  return present;
}

function getRoomNumericSortValue(card: DashboardSpaceCard): number {
  return Number.isInteger(Number(card.roomNumber ?? '')) ? Number(card.roomNumber) : Number.MAX_SAFE_INTEGER;
}

function compareDashboardCards(a: DashboardSpaceCard, b: DashboardSpaceCard): number {
  const usageDiff = Number(b.cumulativeUsage ?? 0) - Number(a.cumulativeUsage ?? 0);
  if (usageDiff !== 0) return usageDiff;

  const floorSortA = a.publicFacility ? Number.MAX_SAFE_INTEGER : (Number.isFinite(a.floor) ? a.floor : 0);
  const floorSortB = b.publicFacility ? Number.MAX_SAFE_INTEGER : (Number.isFinite(b.floor) ? b.floor : 0);
  if (floorSortA !== floorSortB) return floorSortA - floorSortB;

  const roomSortDiff = getRoomNumericSortValue(a) - getRoomNumericSortValue(b);
  if (roomSortDiff !== 0) return roomSortDiff;

  return (a.title || a.roomNumber || a.key).localeCompare(b.title || b.roomNumber || b.key, 'zh-CN');
}

export function RoomsGrid({ rooms, pricePerKwh, flatMode = false }: RoomsGridProps) {
  const publicFacilityCards = rooms.filter((room) => !!room.publicFacility);
  const floorCards = rooms.filter((room) => !room.publicFacility);

  const sortedFlatCards = useMemo<DashboardSpaceCard[]>(() => {
    return [...rooms].sort(compareDashboardCards);
  }, [rooms]);

  const sortedPublicFacilityCards = useMemo(
    () => [...publicFacilityCards].sort(compareDashboardCards),
    [publicFacilityCards],
  );

  const floorGroups = useMemo(() => {
    const groups = new Map<number, DashboardSpaceCard[]>();
    for (const room of floorCards) {
      const floor = Number.isFinite(room.floor) ? room.floor : 0;
      const list = groups.get(floor) ?? [];
      list.push(room);
      groups.set(floor, list);
    }
    for (const [floor, list] of groups.entries()) {
      groups.set(floor, [...list].sort(compareDashboardCards));
    }
    return groups;
  }, [floorCards]);

  const sortedFloors = useMemo(
    () => Array.from(floorGroups.keys()).sort((a, b) => a - b),
    [floorGroups]
  );

  const defaultCategoryByFloor = useMemo(() => {
    const m = new Map<number, string>();
    for (const floor of sortedFloors) {
      const cards = floorGroups.get(floor) ?? [];
      const counts = summarizeCategoryCounts(cards);
      const present = presentCategories(counts);
      if (present.length > 0) m.set(floor, present[0]);
    }
    return m;
  }, [floorGroups, sortedFloors]);

  const [activeCategoryByFloor, setActiveCategoryByFloor] = useState<Record<number, string>>({});

  if (flatMode) {
    return (
      <div className="w-full">
        <div className="app-card-grid-tight" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 360px))',
          justifyContent: 'flex-start',
        }}>
          {sortedFlatCards.map((room) => (
            <RoomCard key={room.key} room={room} pricePerKwh={pricePerKwh} />
          ))}
        </div>
        {sortedFlatCards.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center text-sm text-muted-foreground">
            当前筛选条件下没有匹配的房间卡片。
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {publicFacilityCards.length > 0 ? (
        <section className="w-full space-y-2.5 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-3 dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900 dark:border-amber-900/40">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  ⚡
                </span>
                公共设施
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  公共无线网络 / 视频监控 / 5G 网关
                </span>
              </h3>
              <span className="text-sm text-muted-foreground">
                共 {totalDeviceCount(summarizeCategoryCounts(publicFacilityCards))} 个设备
                （{formatCategorySummary(summarizeCategoryCounts(publicFacilityCards))}）
              </span>
              <span className="text-xs text-muted-foreground">· {publicFacilityCards.length} 组</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
              不归属任何楼层/房间
            </span>
          </div>
          {(() => {
            const cards = sortedPublicFacilityCards;
            return (
              <div className="app-card-grid-tight" style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 360px))',
                justifyContent: 'flex-start',
              }}>
                {cards.map((room) => (
                  <RoomCard key={room.key} room={room} pricePerKwh={pricePerKwh} />
                ))}
              </div>
            );
          })()}
        </section>
      ) : null}

      {sortedFloors.map((floor) => {
        const groupCards = floorGroups.get(floor) ?? [];
        const categoryCounts = summarizeCategoryCounts(groupCards);
        const totalDevices = totalDeviceCount(categoryCounts);
        const categorySummary = formatCategorySummary(categoryCounts);
        const presentCats = presentCategories(categoryCounts);
        const showCategoryTabs = presentCats.length >= 2;
        const activeCategory =
          activeCategoryByFloor[floor] ??
          defaultCategoryByFloor.get(floor) ??
          (presentCats[0] as string | undefined) ??
          ('circuit_breaker' as string);
        const byPrimary = groupCardsByPrimaryCategory(groupCards);

        return (
          <section key={`floor-${floor}`} className="w-full space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-lg font-semibold tracking-tight">
                  <span className="mr-1 text-muted-foreground">{FLOOR_LABEL_PREFIX}</span>
                  {formatFloorLabel(floor)}
                </h3>
                <span className="text-sm text-muted-foreground">
                  共 {totalDevices} 个设备
                  {categorySummary ? `（${categorySummary}）` : ''}
                </span>
                <span className="text-xs text-muted-foreground">· {groupCards.length} 个房间</span>
              </div>
            </div>

            {showCategoryTabs ? (
              <Tabs
                value={activeCategory}
                onValueChange={(val) =>
                  setActiveCategoryByFloor((prev) => ({ ...prev, [floor]: val }))
                }
                className="w-full"
              >
                <TabsList className="mb-3 grid w-full" style={{ gridTemplateColumns: `repeat(${presentCats.length}, minmax(0, 1fr))` }}>
                  {presentCats.map((cat) => (
                    <TabsTrigger key={cat} value={cat as string}>
                      {DEVICE_CATEGORY_LABEL[cat] ?? cat}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {categoryCounts[cat] ?? 0}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {presentCats.map((cat) => {
                  const cards = byPrimary.get(cat) ?? [];
                  return (
                    <TabsContent key={cat} value={cat as string} className="mt-0">
                      {cards.length > 0 ? (
                        <div className="app-card-grid-tight" style={{
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 360px))',
                          justifyContent: 'flex-start',
                        }}>
                          {cards.map((room) => (
                            <RoomCard key={room.key} room={room} pricePerKwh={pricePerKwh} />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                          {DEVICE_CATEGORY_LABEL[cat] ?? cat} 当前还没有设备，去「系统设置 → 设备管理」添加即可。
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            ) : (
              <div className="app-card-grid-tight" style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 360px))',
                justifyContent: 'flex-start',
              }}>
                {groupCards.map((room) => (
                  <RoomCard key={room.key} room={room} pricePerKwh={pricePerKwh} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default RoomsGrid;
