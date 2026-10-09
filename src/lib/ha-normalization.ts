import { createHash } from "node:crypto";
import type { NowPlaying } from "./now-playing.ts";

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
}

export function isHAEntity(value: unknown): value is HAEntity {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<HAEntity>;
  return typeof e.entity_id === "string" && typeof e.state === "string" && !!e.attributes && typeof e.attributes === "object" && !Array.isArray(e.attributes);
}

export function detectSource(sensor?: HAEntity): NowPlaying["source"] {
  if (sensor?.state === "on") return "vinyl";
  if (sensor?.state === "off") return "streaming";
  return "unknown";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1000) : undefined;
}
function number(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : undefined;
}

export function normalizeHA(player: HAEntity | undefined, sensor: HAEntity | undefined, artwork?: string): NowPlaying {
  const a = player?.attributes ?? {};
  const title = text(a.media_title), artist = text(a.media_artist), album = text(a.media_album_name);
  const state: NowPlaying["state"] = player?.state === "playing" || player?.state === "paused" ? player.state
    : ["idle", "off", "standby"].includes(player?.state ?? "") ? "idle" : "unavailable";
  const updated = typeof a.media_position_updated_at === "string" ? Date.parse(a.media_position_updated_at) : NaN;
  // Hash media IDs so upstream URLs or integration-specific access parameters never reach the browser.
  const id = createHash("sha256").update(JSON.stringify([text(a.media_content_id), title, artist, album])).digest("hex").slice(0, 24);
  return {
    id, title, artist, album, artwork, state, source: detectSource(sensor),
    duration: number(a.media_duration, Number.MIN_VALUE),
    position: number(a.media_position, 0),
    positionUpdatedAt: Number.isFinite(updated) ? updated : undefined,
  };
}
