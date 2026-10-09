"use client";

import { useEffect, useState } from "react";
import { playbackPosition } from "@/lib/now-playing";
import { WAITING_TRACK, type BroadcastSnapshot } from "@/lib/broadcast";

export function useBroadcast(input: "live" | "mock", preview: number): BroadcastSnapshot {
  const [snapshot, setSnapshot] = useState<BroadcastSnapshot>({ mode: "homeassistant", connection: "connecting", nowPlaying: { ...WAITING_TRACK }, receivedAt: Date.now() });
  useEffect(() => {
    let events: EventSource | undefined;
    let disposed = false;
    const freeze = (message: string) => setSnapshot(previous => {
      const now = Date.now();
      return { ...previous, connection: "reconnecting", message, nowPlaying: { ...previous.nowPlaying, state: "disconnected", position: playbackPosition(previous.nowPlaying, now), positionUpdatedAt: now }, receivedAt: now };
    });
    const connect = () => {
      events?.close();
      if (disposed || document.hidden) return;
      const url = input === "mock" ? `/api/events?mode=mock&preview=${preview}` : "/api/events";
      events = new EventSource(url);
      events.addEventListener("broadcast", (event) => {
        if (disposed) return;
        try { setSnapshot(JSON.parse((event as MessageEvent).data) as BroadcastSnapshot); }
        catch { freeze("The broadcast signal could not be read. Reconnecting."); }
      });
      events.onerror = () => { if (!disposed) freeze("The display server connection was lost. Reconnecting."); };
    };
    const visibility = () => {
      if (document.hidden) events?.close();
      else connect();
    };
    freeze("Connecting to the broadcast.");
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; events?.close(); document.removeEventListener("visibilitychange", visibility); };
  }, [input, preview]);
  return snapshot;
}
