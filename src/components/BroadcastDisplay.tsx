"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBroadcast } from "@/hooks/useBroadcast";
import { DEFAULT_PREFERENCES, sanitizePreferences, STORAGE_KEY, type VisualPreferences } from "@/lib/preferences";
import type { AnalogDisplay, DisplayStats } from "@/rendering/display";
import { SettingsPanel } from "./SettingsPanel";

export function BroadcastDisplay() {
  const host = useRef<HTMLDivElement>(null);
  const display = useRef<AnalogDisplay | null>(null);
  const [preferences, setPreferences] = useState<VisualPreferences>(DEFAULT_PREFERENCES);
  const preferencesRef = useRef(preferences);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState(0);
  const [inputMode, setInputMode] = useState<"live" | "mock">("live");
  const snapshot = useBroadcast(inputMode, preview);
  const trackRef = useRef(snapshot.nowPlaying);
  trackRef.current = snapshot.nowPlaying;
  const broadcastLabel = snapshot.mode === "mock" ? "MOCK BROADCAST" : snapshot.connection === "connected" ? "HOME ASSISTANT" : snapshot.connection.toUpperCase();
  const broadcastLabelRef = useRef(broadcastLabel);
  broadcastLabelRef.current = broadcastLabel;
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string>();
  const [artworkError, setArtworkError] = useState(false);
  const [persistenceError, setPersistenceError] = useState(false);
  const [stats, setStats] = useState<DisplayStats>();
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const restored = raw ? sanitizePreferences(JSON.parse(raw)) : { ...DEFAULT_PREFERENCES, motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches };
      preferencesRef.current = restored;
      setPreferences(restored);
    } catch { setPersistenceError(true); }
    setLoaded(true);
    setFullscreenSupported(!!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function");
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  useEffect(() => {
    if (!loaded || !host.current) return;
    const element = host.current;
    let cancelled = false;
    let instance: AnalogDisplay | undefined;
    setReady(false);
    setError(undefined);
    async function start() {
      try {
        await Promise.all([document.fonts.load('16px "DM Mono"'), document.fonts.load('16px "Libre Caslon Display"')]);
        const { AnalogDisplay } = await import("@/rendering/display");
        if (cancelled) return;
        instance = new AnalogDisplay(element, preferencesRef.current, trackRef.current, {
          onStats: (value) => { if (!cancelled) setStats(value); },
          onContextLost: () => { if (!cancelled) setError("The picture signal was interrupted. Restore the picture to reconnect the display."); },
          onContextRestored: () => { if (!cancelled) setRevision((value) => value + 1); },
          onArtworkError: () => { if (!cancelled) setArtworkError(true); },
        });
        display.current = instance;
        await instance.init();
        if (cancelled) { instance.destroy(); return; }
        instance.setTrack(trackRef.current, broadcastLabelRef.current);
        instance.applyPreferences(preferencesRef.current);
        setReady(true);
      } catch (cause) {
        console.error("PVR display initialization failed", cause);
        instance?.destroy();
        if (!cancelled) setError("The display could not start. Check that WebGL is available, then restore the picture.");
      }
    }
    void start();
    return () => { cancelled = true; instance?.destroy(); display.current = null; };
  }, [loaded, revision]);

  useEffect(() => {
    display.current?.setTrack(snapshot.nowPlaying, broadcastLabel);
  }, [snapshot, broadcastLabel]);

  useEffect(() => { setArtworkError(false); }, [snapshot.nowPlaying.artwork]);

  const changePreferences = useCallback((value: VisualPreferences) => {
    const sanitized = sanitizePreferences(value);
    preferencesRef.current = sanitized;
    setPreferences(sanitized);
    display.current?.applyPreferences(sanitized);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized)); setPersistenceError(false); }
    catch { setPersistenceError(true); }
  }, []);

  const changePreview = (index: number) => {
    setPreview(index);
  };
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s" && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
        setSettingsOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setFullscreenSupported(false); }
  }

  const track = snapshot.nowPlaying;
  return <main className="broadcast-shell">
    <div className="picture-host" ref={host} />
    <div className="sr-only" role="img" aria-label={`Public Vinyl Radio ${snapshot.mode === "mock" ? "mock" : "live"} broadcast. ${track.state}. ${[track.title, track.artist, track.album, track.label, track.year].filter(Boolean).join(". ")}. Source: ${track.source}. Procedural signal visualization.`} />
    {!ready && !error && <div className="startup-screen"><span className="startup-logo">PVR</span><span className="eyebrow">ESTABLISHING PICTURE SIGNAL</span></div>}
    {error && <div className="signal-error" role="alert"><span className="eyebrow">PVR / SIGNAL LOST</span><p>{error}</p><button onClick={() => setRevision((value) => value + 1)}>Restore picture</button></div>}
    {artworkError && settingsOpen && <p className="artwork-notice" role="status">Artwork unavailable. Showing the station sleeve.</p>}
    <div className="corner-controls" inert={settingsOpen ? true : undefined}>
      {fullscreenSupported && <button className="corner-button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>}
      <button className="corner-button" aria-label="Open picture controls" title="Picture controls (S)" onClick={() => setSettingsOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6h14M3 14h14M7 3v6m6 2v6" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
    </div>
    {settingsOpen && <SettingsPanel preferences={preferences} onChange={changePreferences} onClose={closeSettings} preview={preview} onPreview={changePreview} stats={stats} persistenceError={persistenceError} inputMode={inputMode} onInputMode={setInputMode} snapshot={snapshot} />}
  </main>;
}
