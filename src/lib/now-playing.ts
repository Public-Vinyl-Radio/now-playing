export interface NowPlaying {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  source: "vinyl" | "streaming" | "unknown";
  state: "playing" | "paused" | "idle" | "unavailable" | "disconnected";
  duration?: number;
  position?: number;
  positionUpdatedAt?: number;
  year?: string;
  catalog?: string;
  trackNumber?: string;
}

export function trackIdentity(track: NowPlaying): string {
  // Artwork, position, and connection status are deliberately excluded.
  return JSON.stringify([track.id, track.title ?? "", track.artist ?? "", track.album ?? ""]);
}

export function playbackPosition(track: NowPlaying, now: number): number | undefined {
  if (track.position === undefined || !Number.isFinite(track.position)) return undefined;
  const elapsed = track.state === "playing" && track.positionUpdatedAt !== undefined
    ? Math.max(0, (now - track.positionUpdatedAt) / 1000) : 0;
  return Math.min(track.duration ?? Infinity, Math.max(0, track.position + elapsed));
}

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—:——";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
