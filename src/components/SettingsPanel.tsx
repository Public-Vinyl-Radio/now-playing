"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_PREFERENCES, type VisualPreferences } from "@/lib/preferences";
import type { DisplayStats } from "@/rendering/display";
import type { BroadcastSnapshot } from "@/lib/broadcast";

interface Props {
  preferences: VisualPreferences;
  onChange: (value: VisualPreferences) => void;
  onClose: () => void;
  preview: number;
  onPreview: (index: number) => void;
  stats?: DisplayStats;
  persistenceError: boolean;
  inputMode: "live" | "mock";
  onInputMode: (mode: "live" | "mock") => void;
  snapshot: BroadcastSnapshot;
}

const CONTROLS = [
  ["curvature", "Screen curvature", 0, 0.5, 0.01],
  ["scanlines", "Scanlines", 0, 0.7, 0.01],
  ["bloom", "Phosphor bloom", 0, 0.8, 0.01],
  ["noise", "Analog grain", 0, 0.5, 0.01],
  ["aberration", "Color separation", 0, 1, 0.01],
  ["glitches", "Signal instability", 0, 1, 0.01],
  ["renderScale", "Render scale", 0.5, 1, 0.05],
] as const;

export function SettingsPanel({ preferences, onChange, onClose, preview, onPreview, stats, persistenceError, inputMode, onInputMode, snapshot }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button, input, select");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [onClose]);

  const update = <K extends keyof VisualPreferences>(key: K, value: VisualPreferences[K]) => onChange({ ...preferences, [key]: value });

  return <div className="settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={panel}>
      <header className="settings-header">
        <div><span className="eyebrow">PVR / ENGINEERING</span><h1 id="settings-title">Picture controls</h1></div>
        <button className="close-button" aria-label="Close picture controls" onClick={onClose} ref={closeButton}>×</button>
      </header>
      <p className="settings-intro">Tune the picture for your listening room.</p>
      <div className="settings-fields">
        <label className="select-field">Color profile
          <select value={preferences.colorProfile} onChange={(e) => update("colorProfile", e.target.value as VisualPreferences["colorProfile"])}>
            <option value="warm">Warm broadcast</option><option value="green">Green phosphor</option><option value="amber">Amber monochrome</option><option value="mono">Black &amp; white</option>
          </select>
        </label>
        {CONTROLS.map(([key, label, min, max, step]) => <label className="slider-field" key={key} htmlFor={`picture-${key}`}>
          <span>{label}<output>{Math.round(preferences[key] * 100)}%</output></span>
          <input id={`picture-${key}`} type="range" min={min} max={max} step={step} value={preferences[key]} onChange={(e) => update(key, Number(e.target.value))} />
        </label>)}
        <label className="select-field">Target frame rate
          <select value={preferences.fps} onChange={(e) => update("fps", Number(e.target.value))}>
            <option value="15">15 FPS</option><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option>
          </select>
        </label>
        <label className="checkbox-field"><input type="checkbox" checked={preferences.motion} onChange={(e) => update("motion", e.target.checked)} /> Animate the picture</label>
      </div>
      <section className="preview-settings" aria-label="Broadcast settings">
        <span className="eyebrow">BROADCAST INPUT</span>
        <label className="select-field">Transmission
          <select value={inputMode} onChange={(e) => onInputMode(e.target.value as "live" | "mock")}>
            <option value="live">Configured broadcast</option><option value="mock">Mock broadcast</option>
          </select>
        </label>
        <p className="render-stats" role="status">{snapshot.mode === "mock" ? "MOCK BROADCAST" : `HOME ASSISTANT / ${snapshot.connection.toUpperCase()}`}{snapshot.message ? ` · ${snapshot.message}` : ""}</p>
        {snapshot.mode === "mock" && <label className="select-field">Preview transmission
          <select value={preview} onChange={(e) => onPreview(Number(e.target.value))}>
            <option value="0">Friday Morning · vinyl with timing</option><option value="1">Maria También · streaming</option><option value="2">Friday Morning · vinyl without timing</option>
            <option value="3">Long song title · typography preview</option>
          </select>
        </label>}
      </section>
      {stats && <p className="render-stats">{preferences.motion ? `${stats.fps} FPS` : "STILL PICTURE"} · {Math.round(stats.width * stats.resolution)} × {Math.round(stats.height * stats.resolution)} PX · WEBGL</p>}
      {persistenceError && <p className="settings-note">Preferences are active for this session. Browser storage is unavailable.</p>}
      <footer className="settings-footer"><button onClick={() => onChange({ ...DEFAULT_PREFERENCES })}>Restore defaults</button><button className="done-button" onClick={onClose}>Return to broadcast ↗</button></footer>
    </div>
  </div>;
}
