export function normalizeRoomAnnotation(
  roomNumber: string,
  rawName?: string | null,
): string | null {
  const value = rawName?.trim();
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, '').toLowerCase();
  const roomNumberNormalized = roomNumber.trim().toLowerCase();
  const defaults = new Set([
    roomNumberNormalized,
    `房间${roomNumberNormalized}`,
    `${roomNumberNormalized}号房间`,
    `${roomNumberNormalized}房间`,
    `room${roomNumberNormalized}`,
    `room-${roomNumberNormalized}`,
    `room${roomNumberNormalized}`,
  ]);

  return defaults.has(normalized) ? null : value;
}

export function formatRoomDisplayName(
  roomNumber: string,
  rawName?: string | null,
): string {
  const annotation = normalizeRoomAnnotation(roomNumber, rawName);
  return annotation ? `${roomNumber} (${annotation})` : roomNumber;
}
