"use client";

import { useEffect, useRef, useState } from "react";
import { TextureLoader } from "three";
import { DEFAULT_LOGO_OPTIONS, LogoScene, type LogoOptions, type LogoSurface, type SvgReport } from "@/rendering/logo3d";

type DirectoryPicker = (options?: { mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle>;

const DEFAULT_SVG = "/pvr-logo-outlined.svg";

const RESOLUTIONS = [
  ["1920x1080", "1080p (1920 × 1080)", 1920, 1080],
  ["3840x2160", "4K UHD (3840 × 2160)", 3840, 2160],
  ["1080x1080", "Square (1080 × 1080)", 1080, 1080],
] as const;

const FRAME_RATES = [24, 25, 30, 60] as const;

const SLIDERS = [
  ["depth", "Depth", 0.01, 0.3, 0.005],
  ["bevel", "Bevel", 0, 0.03, 0.001],
  ["duration", "Duration (s)", 1, 12, 0.5],
  ["turns", "Turns", 0, 6, 1],
  ["tilt", "Tilt (°)", -30, 30, 1],
] as const;

const MATERIALS = [
  ["face", "Face"],
  ["side", "Sides"],
] as const;

export function LogoStudio() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const logo = useRef<LogoScene | null>(null);
  const [options, setOptions] = useState<LogoOptions>(DEFAULT_LOGO_OPTIONS);
  const [svgName, setSvgName] = useState<string | null>(null);
  const [report, setReport] = useState<SvgReport | null>(null);
  const [textureNames, setTextureNames] = useState<Record<LogoSurface, string | null>>({ face: null, side: null });
  const [resolution, setResolution] = useState<string>(RESOLUTIONS[0][0]);
  const [fps, setFps] = useState<number>(30);
  const [progress, setProgress] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [, , width, height] = RESOLUTIONS.find(([key]) => key === resolution) ?? RESOLUTIONS[0];

  useEffect(() => {
    if (!canvas.current || !stage.current) return;
    const scene = new LogoScene(canvas.current);
    logo.current = scene;
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(stage.current);
    fetch(DEFAULT_SVG).then(response => response.ok ? response.text() : null).then(text => {
      if (text && logo.current === scene) { setReport(scene.setSvg(text)); setSvgName(DEFAULT_SVG.slice(1)); }
    }).catch(() => {});
    return () => { observer.disconnect(); scene.dispose(); logo.current = null; };
  }, []);

  useEffect(() => { logo.current?.setOptions(options); }, [options]);

  const update = <K extends keyof LogoOptions>(key: K, value: LogoOptions[K]) => setOptions(current => ({ ...current, [key]: value }));

  const loadSvg = async (file: File | undefined) => {
    if (!file || !logo.current) return;
    setReport(logo.current.setSvg(await file.text()));
    setSvgName(file.name);
  };

  const loadTexture = (surface: LogoSurface, file: File | undefined) => {
    if (!file || !logo.current) return;
    const url = URL.createObjectURL(file);
    const scene = logo.current;
    new TextureLoader().load(url, texture => {
      scene.setTexture(surface, texture);
      URL.revokeObjectURL(url);
      setTextureNames(current => ({ ...current, [surface]: file.name }));
    });
  };

  const clearTexture = (surface: LogoSurface) => {
    logo.current?.setTexture(surface, null);
    setTextureNames(current => ({ ...current, [surface]: null }));
  };

  const exportFrames = async () => {
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    if (!picker) { setProgress("Frame export needs Chrome or Edge (File System Access API)."); return; }
    if (!logo.current) return;
    let directory: FileSystemDirectoryHandle;
    try { directory = await picker({ mode: "readwrite" }); } catch { return; }
    setExporting(true);
    try {
      await logo.current.exportFrames(directory, { width, height, fps }, (done, total) => setProgress(`Rendering frame ${done} of ${total}…`));
      setProgress(`Done. Saved PNG frames to “${directory.name}”.`);
    } catch (error) {
      setProgress(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const ffmpeg = `ffmpeg -framerate ${fps} -i pvr_logo_%04d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le pvr_logo.mov`;

  return <div className="logo-studio">
    <div className="logo-stage-wrap" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); loadSvg(event.dataTransfer.files[0]); }}>
      <div className="logo-stage" ref={stage} style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas ref={canvas} />
        {!report?.shapes && <p className="logo-stage-empty">{report ? "No filled shapes found in this SVG. Convert text and strokes to outlines, then try again." : `Drop an outlined SVG here, or add ${DEFAULT_SVG.slice(1)} to public/.`}</p>}
      </div>
    </div>

    <aside className="logo-panel">
      <header><span className="eyebrow">PVR / ENGINEERING</span><h1>Logo studio</h1></header>

      <section className="settings-section">
        <h2>Artwork</h2>
        <label className="file-field">SVG logo<input type="file" accept=".svg,image/svg+xml" onChange={event => loadSvg(event.target.files?.[0])} /></label>
        <p className="settings-note">{svgName ? `${svgName}: ${report?.shapes ?? 0} shapes` : "No logo loaded."}{report?.skipped ? `, ${report.skipped} outline-only paths skipped` : ""}</p>
      </section>

      <section className="settings-section">
        <h2>Shape & motion</h2>
        <label className="select-field">Motion
          <select value={options.motion} onChange={event => update("motion", event.target.value as LogoOptions["motion"])}>
            <option value="intro">Intro: spin in, land facing front</option>
            <option value="loop">Loop: constant seamless spin</option>
          </select>
        </label>
        {SLIDERS.map(([key, label, min, max, step]) => <label className="slider-field" key={key}>
          <span>{label}<output>{options[key]}</output></span>
          <input type="range" min={min} max={max} step={step} value={options[key]} onChange={event => update(key, Number(event.target.value))} />
        </label>)}
      </section>

      <section className="settings-section">
        <h2>Materials</h2>
        {MATERIALS.map(([prefix, label]) => <fieldset className="type-controls" key={prefix}>
          <legend>{label}</legend>
          <label className="color-field">Color<input type="color" value={options[`${prefix}Color`]} onChange={event => update(`${prefix}Color`, event.target.value)} /></label>
          {(["Metalness", "Roughness"] as const).map(property => <label className="slider-field" key={property}>
            <span>{property}<output>{options[`${prefix}${property}`]}</output></span>
            <input type="range" min={0} max={1} step={0.01} value={options[`${prefix}${property}`]} onChange={event => update(`${prefix}${property}`, Number(event.target.value))} />
          </label>)}
          <label className="file-field">Texture<input type="file" accept="image/*" onChange={event => { loadTexture(prefix, event.target.files?.[0]); event.target.value = ""; }} /></label>
          {textureNames[prefix] && <p className="settings-note">{textureNames[prefix]} · <button className="text-button" onClick={() => clearTexture(prefix)}>Remove</button></p>}
          {prefix === "side" && textureNames.side && <label className="slider-field">
            <span>Repeats across edge<output>{options.sideTextureScale}</output></span>
            <input type="range" min={0.25} max={4} step={0.25} value={options.sideTextureScale} onChange={event => update("sideTextureScale", Number(event.target.value))} />
          </label>}
          <p className="settings-note">{prefix === "face" ? "Spans the face once." : "Tiles around the edges and bevels; seamless textures work best."} Tinted by the color above; set it to white to show the image unchanged.</p>
        </fieldset>)}
        <label className="checkbox-field"><input type="checkbox" checked={options.background === null} onChange={event => update("background", event.target.checked ? null : "#121511")} />Transparent background</label>
        {options.background !== null && <label className="color-field">Background<input type="color" value={options.background} onChange={event => update("background", event.target.value)} /></label>}
      </section>

      <section className="settings-section">
        <h2>Export</h2>
        <label className="select-field">Resolution
          <select value={resolution} onChange={event => setResolution(event.target.value)}>
            {RESOLUTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="select-field">Frame rate
          <select value={fps} onChange={event => setFps(Number(event.target.value))}>
            {FRAME_RATES.map(rate => <option key={rate} value={rate}>{rate} fps</option>)}
          </select>
        </label>
        <button className="export-button" disabled={exporting || !report?.shapes} onClick={exportFrames}>{exporting ? "Exporting…" : "Export PNG frames"}</button>
        {progress && <p className="settings-note" role="status">{progress}</p>}
        <p className="settings-note">Then convert to ProRes 4444 with alpha for DaVinci Resolve:</p>
        <code className="logo-command">{ffmpeg}</code>
      </section>
    </aside>
  </div>;
}
