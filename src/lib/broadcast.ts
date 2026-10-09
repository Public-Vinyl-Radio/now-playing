import type { NowPlaying } from "./now-playing";

export type BroadcastMode = "homeassistant" | "mock";
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "unconfigured" | "error";
export interface BroadcastSnapshot {
  mode: BroadcastMode;
  connection: ConnectionState;
  nowPlaying: NowPlaying;
  message?: string;
  receivedAt: number;
}

export const WAITING_TRACK: NowPlaying = { id: "pvr-waiting", source: "unknown", state: "disconnected" };
