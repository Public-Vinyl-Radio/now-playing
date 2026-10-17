"use client";

import { useEffect, useRef, useState } from "react";
import { isRoomId, ROOMS, type RoomId, type StreamStatus } from "@/lib/rooms";

interface Props { room: RoomId; onRoomChange: (room: RoomId) => void; mock: boolean; inert: boolean }

export function ListeningControls({ room, onRoomChange, mock, inert }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<StreamStatus>("unavailable");
  const [playback, setPlayback] = useState<"stopped" | "connecting" | "playing">("stopped");
  const [error, setError] = useState<string>();
  const current = ROOMS.find(value => value.id === room)!;

  const stop = () => {
    const element = audio.current;
    if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    setPlayback("stopped");
  };

  useEffect(() => {
    const element = audio.current;
    return () => { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } };
  }, []);

  useEffect(() => {
    if (mock) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/streams", { cache: "no-store", signal: controller.signal });
        const states = response.ok ? await response.json() : {};
        if (!controller.signal.aborted) {
          const value = states[room];
          setStatus(["live", "off", "waiting"].includes(value) ? value : "unavailable");
        }
      } catch { if (!controller.signal.aborted) setStatus("unavailable"); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [room, mock]);

  useEffect(() => {
    if (status === "off" && playback !== "stopped") {
      stop();
      setError("This room has gone off air.");
    }
  }, [status, playback]);

  async function toggle() {
    if (playback !== "stopped") { stop(); setError(undefined); return; }
    const element = audio.current;
    if (!element) return;
    setError(undefined);
    setPlayback("connecting");
    element.src = `/${current.source}.mp3`;
    try { await element.play(); }
    catch { stop(); setError("Audio could not start. Try Listen live again."); }
  }

  const label = mock ? "Preview · audio off" : error ?? (playback === "connecting" ? "Connecting…"
    : playback === "playing" ? "Listening live" : status === "live" ? "On air"
    : status === "off" ? "Off air" : status === "waiting" ? "Waiting for audio" : "Audio unavailable");

  return <div className="listening-controls" inert={inert ? true : undefined}>
    <label className="room-select"><span className="sr-only">Listening room</span>
      <select aria-label="Listening room" value={room} onChange={event => {
        if (isRoomId(event.target.value)) { stop(); onRoomChange(event.target.value); }
      }}>{ROOMS.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select>
    </label>
    <span className={`air-indicator ${!mock && status === "live" ? "on-air" : ""}`} aria-hidden="true" />
    <button className="listen-button" disabled={mock || (status !== "live" && playback === "stopped")} onClick={toggle}>
      {playback === "stopped" ? "Listen live" : "Stop listening"}
    </button>
    <span className="listen-status" role="status">{label}</span>
    <audio ref={audio} preload="none" onPlaying={() => setPlayback("playing")}
      onWaiting={() => setPlayback(value => value === "stopped" ? value : "connecting")}
      onError={() => { stop(); setError("The broadcast is unavailable. Try again shortly."); }}
      onEnded={() => { stop(); setError("The broadcast has ended."); }} />
  </div>;
}
