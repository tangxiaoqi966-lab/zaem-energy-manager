import RoomCard from './RoomCard';
import type { DeviceItem, RoomStatus } from '../../types';

export interface DashboardSpaceCard {
  key: string;
  title: string;
  subtitle: string;
  roomId: string | null;
  roomNumber: string | null;
  roomAnnotation: string | null;
  status: RoomStatus;
  power: number;
  todayUsage: number;
  monthUsage: number;
  usagePercent: number;
  dailyLimit: number | null;
  limitEnabled: boolean;
  cutoff: boolean;
  deviceOnline: boolean;
  powerActionCooldownUntil: string | null;
  powerActionRetryAfterSeconds: number;
  powerActionLastType: 'cutoff_power' | 'restore_power' | null;
  devices: DeviceItem[];
  mapped: boolean;
}

interface RoomsGridProps {
  rooms: DashboardSpaceCard[];
  pricePerKwh: number;
}

export function RoomsGrid({ rooms, pricePerKwh }: RoomsGridProps) {
  return (
    <div className="w-full">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        }}
      >
        {rooms.map((room) => (
          <RoomCard key={room.key} room={room} pricePerKwh={pricePerKwh} />
        ))}
      </div>
    </div>
  );
}

export default RoomsGrid;
