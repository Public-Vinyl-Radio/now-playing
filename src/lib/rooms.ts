export const ROOMS = [
  { id: "living-room", name: "Living Room", source: "aswitch" },
  { id: "lounge", name: "Lounge", source: "pi-cam" },
] as const;

export type RoomId = typeof ROOMS[number]["id"];
export function isRoomId(value: unknown): value is RoomId {
  return ROOMS.some(room => room.id === value);
}

export type StreamStatus = "live" | "waiting" | "off" | "unavailable";
export type StreamStatuses = Record<RoomId, StreamStatus>;
