"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_PREFERENCES, PARAMETER_RANGES, type VisualPreferences } from "@/lib/preferences";
import { BROADCAST_FONTS, METADATA_FIELDS } from "@/lib/fonts";
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
  artworkError: boolean;
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
] as const;

export function SettingsPanel({ preferences, onChange, onClose, preview, onPreview, stats, persistenceError, artworkError, inputMode, onInputMode, snapshot }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [onClose]);

  const update = <K extends keyof VisualPreferences>(key: K, value: VisualPreferences[K]) => onChange({ ...preferences, [key]: value });

  return <div className="settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={panel}>
      <header className="settings-header">
        <div><span className="eyebrow">PVR / ENGINEERING</span><h1 id="settings-title">Broadcast settings</h1></div>
        <button className="close-button" aria-label="Close settings" onClick={onClose} ref={closeButton}>×</button>
      </header>
      <p className="settings-intro">Tune the picture for your listening room. Changes apply immediately.</p>
      <div className="settings-grid">
        <section className="settings-section" aria-labelledby="appearance-title">
          <h2 id="appearance-title">Appearance</h2>
          <label className="checkbox-field"><input type="checkbox" checked={preferences.showArtwork} onChange={(e) => update("showArtwork", e.target.checked)} /> Show album artwork</label>
          <p className="settings-help">Hide the sleeve for a text-focused broadcast.</p>
          {METADATA_FIELDS.map((field) => {
            const fontKey = `${field}Font` as const;
            const sizeKey = `${field}Size` as const;
            const label = field === "title" ? "Song title" : field === "artist" ? "Artist" : "Album";
            const [min, max] = PARAMETER_RANGES[sizeKey];
            return <fieldset className="type-controls" key={field}>
              <legend>{label}</legend>
              <label className="select-field">{label} font
                <select value={preferences[fontKey]} onChange={(e) => update(fontKey, e.target.value)}>
                  {BROADCAST_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                </select>
              </label>
              <label className="slider-field" htmlFor={`appearance-${sizeKey}`}>
                <span>{label} size<output>{preferences[sizeKey]} px</output></span>
                <input id={`appearance-${sizeKey}`} type="range" min={min} max={max} step={1} value={preferences[sizeKey]} onChange={(e) => update(sizeKey, Number(e.target.value))} />
              </label>
            </fieldset>;
          })}
          <p className="settings-help">Sizes are relative to a 1440 × 960 picture. Text fits the available space; labels keep their original size.</p>
          {artworkError && preferences.showArtwork && <p className="settings-note" role="status">Artwork unavailable. Showing the station sleeve.</p>}
        </section>
        <section className="settings-section" aria-labelledby="picture-title">
          <h2 id="picture-title">Picture</h2>
          <label className="select-field">Color profile
            <select value={preferences.colorProfile} onChange={(e) => update("colorProfile", e.target.value as VisualPreferences["colorProfile"])}>
              <option value="warm">Warm broadcast</option><option value="green">Green phosphor</option><option value="amber">Amber monochrome</option><option value="mono">Black &amp; white</option>
            </select>
          </label>
          {CONTROLS.map(([key, label, min, max, step]) => <label className="slider-field" key={key} htmlFor={`picture-${key}`}>
            <span>{label}<output>{Math.round(preferences[key] * 100)}%</output></span>
            <input id={`picture-${key}`} type="range" min={min} max={max} step={step} value={preferences[key]} onChange={(e) => update(key, Number(e.target.value))} />
          </label>)}
        </section>
        <section className="settings-section" aria-labelledby="rendering-title">
          <h2 id="rendering-title">Rendering &amp; motion</h2>
          <label className="slider-field" htmlFor="picture-renderScale">
            <span>Render scale<output>{Math.round(preferences.renderScale * 100)}%</output></span>
            <input id="picture-renderScale" type="range" min={0.5} max={1} step={0.05} value={preferences.renderScale} onChange={(e) => update("renderScale", Number(e.target.value))} />
          </label>
          <label className="select-field">Target frame rate
            <select value={preferences.fps} onChange={(e) => update("fps", Number(e.target.value))}>
              <option value="15">15 FPS</option><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option>
            </select>
          </label>
          <label className="checkbox-field"><input type="checkbox" checked={preferences.motion} onChange={(e) => update("motion", e.target.checked)} /> Animate the picture</label>
          {stats && <p className="render-stats">{preferences.motion ? `${stats.fps} FPS` : "STILL PICTURE"} · {Math.round(stats.width * stats.resolution)} × {Math.round(stats.height * stats.resolution)} PX · WEBGL</p>}
        </section>
        <section className="settings-section" aria-labelledby="input-title">
          <h2 id="input-title">Broadcast input</h2>
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
      </div>
      {persistenceError && <p className="settings-note">Preferences are active for this session. Browser storage is unavailable.</p>}
      <footer className="settings-footer"><button onClick={() => onChange({ ...DEFAULT_PREFERENCES })}>Restore defaults</button><button className="done-button" onClick={onClose}>Return to broadcast ↗</button></footer>
    </div>
  </div>;
}
