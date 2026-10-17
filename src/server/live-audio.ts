import "server-only";
import { ROOMS, type StreamStatuses } from "../lib/rooms.ts";
import { sameOriginRequest } from "./request-policy.ts";

export function liveAudioOrigin(): URL | undefined {
  const value = process.env.PVR_AUDIO_BASE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PVR_AUDIO_BASE_URL must be an HTTP origin");
  }
  return url;
}

export async function streamStatuses(): Promise<StreamStatuses> {
  const unavailable: StreamStatuses = { "living-room": "unavailable", lounge: "unavailable" };
  try {
    const origin = liveAudioOrigin();
    if (!origin) return unavailable;
    const response = await fetch(new URL("/healthz", origin), { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return unavailable;
    const data = await response.json();
    return Object.fromEntries(ROOMS.map(room => {
      const source = data?.sources?.[room.source];
      const status = typeof source?.enabled !== "boolean" || typeof source?.streaming !== "boolean" ? "unavailable"
        : !source.enabled ? "off" : source.streaming ? "live" : "waiting";
      return [room.id, status];
    })) as StreamStatuses;
  } catch { return unavailable; }
}

export async function listen(request: Request, source: "pi-cam" | "aswitch"): Promise<Response> {
  if (!sameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
  try {
    const origin = liveAudioOrigin();
    if (!origin) return new Response("Live audio is not configured", { status: 503 });
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(new URL(`/${source}.mp3`, origin), {
        cache: "no-store", signal: AbortSignal.any([request.signal, timeout.signal]),
      });
    } finally { clearTimeout(timer); }
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("audio/mpeg")) {
      await upstream.body?.cancel();
      return new Response("This room is off air or waiting for audio", { status: 503 });
    }
    return new Response(upstream.body, { headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Live audio is unavailable", { status: 503 }); }
}
