"use client";

import { useEffect, useState } from "react";
import { playbackPosition } from "@/lib/now-playing";
import { WAITING_TRACK, type BroadcastSnapshot } from "@/lib/broadcast";
import type { RoomId } from "@/lib/rooms";

export function useBroadcast(input: "live" | "mock", preview: number, room: RoomId): BroadcastSnapshot {
  const waiting = (): BroadcastSnapshot => ({ mode: "homeassistant", connection: "connecting", nowPlaying: { ...WAITING_TRACK }, receivedAt: Date.now() });
  const [state, setState] = useState<{ room: RoomId; snapshot: BroadcastSnapshot }>(() => ({ room, snapshot: waiting() }));
  useEffect(() => {
    let events: EventSource | undefined;
    let disposed = false;
    const freeze = (message: string) => setState(previousState => {
      const previous = previousState.room === room ? previousState.snapshot : waiting();
      const now = Date.now();
      return { room, snapshot: { ...previous, connection: "reconnecting", message, nowPlaying: { ...previous.nowPlaying, state: "disconnected", position: playbackPosition(previous.nowPlaying, now), positionUpdatedAt: now }, receivedAt: now } };
    });
    const connect = () => {
      events?.close();
      if (disposed || document.hidden) return;
      const url = `/api/events?room=${room}&preview=${preview}${input === "mock" ? "&mode=mock" : ""}`;
      events = new EventSource(url);
      events.addEventListener("broadcast", (event) => {
        if (disposed) return;
        try { setState({ room, snapshot: JSON.parse((event as MessageEvent).data) as BroadcastSnapshot }); }
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
  }, [input, preview, room]);
  return state.room === room ? state.snapshot : waiting();
}
