import { Application, BlurFilter, Filter, GlProgram, Rectangle, RenderTexture, Sprite, Texture } from "pixi.js";
import { renderResolution, type VisualPreferences } from "../lib/preferences";
import type { NowPlaying } from "../lib/now-playing";
import { trackIdentity } from "../lib/now-playing";
import { NowPlayingScene } from "./scene";
import { BLOOM_FRAGMENT, CRT_FRAGMENT, FILTER_VERTEX } from "./shaders";

export interface DisplayStats { fps: number; width: number; height: number; resolution: number; }
interface DisplayCallbacks {
  onStats: (stats: DisplayStats) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
  onArtworkError: () => void;
}

export class AnalogDisplay {
  private app = new Application();
  private scene?: NowPlayingScene;
  private artwork?: Texture;
  private logo?: Texture;
  private artworkUrl?: string;
  private artworkVersion = 0;
  private broadcastLabel = "CONNECTING";
  private picture?: RenderTexture;
  private glow?: RenderTexture;
  private output?: Sprite;
  private bloomSprite?: Sprite;
  private crt?: Filter;
  private bloomExtract?: Filter;
  private blur?: BlurFilter;
  private observer?: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private initialized = false;
  private lost = false;
  private width = 0;
  private height = 0;
  private lastFrame = 0;
  private statStart = 0;
  private statFrames = 0;
  private nextGlitch = Infinity;
  private glitchStart = -Infinity;

  constructor(private host: HTMLElement, private preferences: VisualPreferences, private track: NowPlaying, private callbacks: DisplayCallbacks) {}

  async init() {
    await this.app.init({
      preference: "webgl",
      preferWebGLVersion: 2,
      autoStart: false,
      background: "#080b08",
      antialias: false,
      autoDensity: true,
      resolution: 1,
      powerPreference: "low-power",
    });
    this.initialized = true;
    if (this.disposed) { this.app.destroy(true, { children: true }); return; }
    this.app.canvas.setAttribute("aria-hidden", "true");
    this.app.canvas.addEventListener("webglcontextlost", this.contextLost);
    this.app.canvas.addEventListener("webglcontextrestored", this.contextRestored);
    this.host.appendChild(this.app.canvas);
    try {
      const image = new Image();
      image.src = "/branding/pvr-logo.svg";
      await image.decode();
      if (!this.disposed) this.logo = Texture.from(image);
    } catch {
      // Preserve the station wordmark if its bundled SVG cannot be loaded.
    }
    if (this.disposed) return;
    this.scene = new NowPlayingScene(this.track, this.artwork, this.logo);
    this.scene.setBroadcastLabel(this.broadcastLabel);
    this.bloomExtract = new Filter({ glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: BLOOM_FRAGMENT, name: "pvr-bright-pass" }), padding: 0 });
    this.blur = new BlurFilter({ strength: 2.4, quality: 2, kernelSize: 5 });
    this.crt = new Filter({
      glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: CRT_FRAGMENT, name: "pvr-crt" }),
      padding: 0,
      resolution: "inherit",
      resources: {
        uBloom: Texture.EMPTY.source,
        crtUniforms: {
          uResolution: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
          uTime: { value: 0, type: "f32" },
          uCurvature: { value: 0, type: "f32" },
          uScanlines: { value: 0, type: "f32" },
          uGlow: { value: 0, type: "f32" },
          uNoise: { value: 0, type: "f32" },
          uAberration: { value: 0, type: "f32" },
          uGlitch: { value: 0, type: "f32" },
          uProfile: { value: 0, type: "f32" },
        },
      },
    });
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.nextGlitch = performance.now() + this.glitchDelay();
    this.resize();
    this.applyPreferences(this.preferences);
    void this.loadArtwork(this.track.artwork);
  }

  private glitchDelay() {
    return this.preferences.glitches === 0 ? Infinity : (20_000 + Math.random() * 60_000) / Math.max(0.2, this.preferences.glitches);
  }

  private resize() {
    if (this.disposed || this.lost || !this.scene || !this.crt) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.width = Math.round(width);
    this.height = Math.round(height);
    const resolution = renderResolution(this.width, this.height, window.devicePixelRatio || 1, this.preferences.renderScale);
    this.app.renderer.resize(this.width, this.height, resolution);
    this.output?.destroy();
    this.bloomSprite?.destroy();
    this.crt.resources.uBloom = Texture.EMPTY.source;
    const oldPicture = this.picture;
    const oldGlow = this.glow;
    this.picture = RenderTexture.create({ width: this.width, height: this.height, resolution, antialias: false });
    const bloomWidth = Math.max(1, Math.round(this.width / 4));
    const bloomHeight = Math.max(1, Math.round(this.height / 4));
    this.glow = RenderTexture.create({ width: bloomWidth, height: bloomHeight, resolution: 1 });
    this.bloomSprite = new Sprite(this.picture);
    this.bloomSprite.width = bloomWidth;
    this.bloomSprite.height = bloomHeight;
    this.bloomSprite.filters = [this.bloomExtract!, this.blur!];
    this.bloomSprite.filterArea = new Rectangle(0, 0, bloomWidth, bloomHeight);
    this.crt.resources.uBloom = this.glow.source;
    this.crt.resources.crtUniforms.uniforms.uResolution = new Float32Array([this.width * resolution, this.height * resolution]);
    this.output = new Sprite(this.picture);
    this.output.filters = [this.crt];
    this.output.filterArea = new Rectangle(0, 0, this.width, this.height);
    this.app.stage.addChild(this.output);
    this.scene.layout(this.width, this.height);
    this.draw(performance.now());
    // Replace GPU bindings with the new targets before disposing the old ones.
    oldPicture?.destroy(true);
    oldGlow?.destroy(true);
  }

  applyPreferences(preferences: VisualPreferences) {
    if (this.disposed) return;
    const resize = preferences.renderScale !== this.preferences.renderScale;
    const frequencyChanged = preferences.glitches !== this.preferences.glitches;
    this.preferences = preferences;
    if (!this.crt) return;
    const u = this.crt.resources.crtUniforms.uniforms;
    u.uCurvature = preferences.curvature;
    u.uScanlines = preferences.scanlines;
    u.uGlow = preferences.bloom;
    u.uNoise = preferences.noise;
    u.uAberration = preferences.aberration;
    u.uProfile = { warm: 0, green: 1, amber: 2, mono: 3 }[preferences.colorProfile];
    if (frequencyChanged) this.nextGlitch = performance.now() + this.glitchDelay();
    if (resize) this.resize();
    this.stop();
    this.draw(performance.now());
    this.start();
  }

  setTrack(track: NowPlaying, broadcastLabel = this.broadcastLabel) {
    const previous = this.track;
    const changed = trackIdentity(track) !== trackIdentity(previous) || track.state !== previous.state || track.source !== previous.source || track.duration !== previous.duration;
    const labelChanged = broadcastLabel !== this.broadcastLabel;
    this.track = track;
    this.broadcastLabel = broadcastLabel;
    if (labelChanged) this.scene?.setBroadcastLabel(broadcastLabel);
    this.scene?.setTrack(track, this.width, this.height, changed || labelChanged);
    if (track.artwork !== this.artworkUrl) void this.loadArtwork(track.artwork);
    this.draw(performance.now());
  }

  private async loadArtwork(url: string | undefined) {
    if (this.disposed || !this.scene) return;
    this.artworkUrl = url;
    const version = ++this.artworkVersion;
    // Remove the previous sleeve immediately; it must not label a different record.
    const old = this.artwork;
    this.artwork = undefined;
    this.scene.setArtwork(undefined, this.width, this.height);
    this.draw(performance.now());
    old?.destroy(true);
    if (!url) return;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (this.disposed || version !== this.artworkVersion) return;
      this.artwork = Texture.from(image);
      this.scene.setArtwork(this.artwork, this.width, this.height);
      this.draw(performance.now());
    } catch { if (!this.disposed && version === this.artworkVersion) this.callbacks.onArtworkError(); }
  }

  private draw(now: number) {
    if (this.disposed || this.lost || !this.scene || !this.picture || !this.glow || !this.bloomSprite || !this.crt) return;
    const animated = this.preferences.motion;
    const time = animated ? now / 1000 : 0;
    this.scene.update(time, Date.now());
    const u = this.crt.resources.crtUniforms.uniforms;
    u.uTime = time;
    if (animated && now >= this.nextGlitch) { this.glitchStart = now; this.nextGlitch = now + this.glitchDelay(); }
    const elapsed = now - this.glitchStart;
    u.uGlitch = animated && elapsed < 170 ? Math.sin(Math.max(0, elapsed) / 170 * Math.PI) * 0.35 : 0;
    this.app.renderer.render({ container: this.scene.container, target: this.picture, clear: true });
    if (this.preferences.bloom > 0) this.app.renderer.render({ container: this.bloomSprite, target: this.glow, clear: true });
    this.app.renderer.render({ container: this.app.stage, clear: true });
    this.statFrames++;
    if (now - this.statStart > 2000) {
      this.callbacks.onStats({ fps: animated ? Math.round(this.statFrames * 1000 / (now - this.statStart)) : 0, width: this.width, height: this.height, resolution: this.app.renderer.resolution });
      this.statFrames = 0;
      this.statStart = now;
    }
  }

  private tick = (now: number) => {
    if (this.disposed || this.lost || document.hidden || !this.preferences.motion) return;
    this.frameId = requestAnimationFrame(this.tick);
    const interval = 1000 / this.preferences.fps;
    if (now - this.lastFrame >= interval - 0.5) {
      this.lastFrame = now - ((now - this.lastFrame) % interval);
      this.draw(now);
    }
  };

  private start() {
    if (this.disposed || this.lost || document.hidden || !this.preferences.motion) return;
    this.lastFrame = performance.now();
    this.statStart = this.lastFrame;
    this.statFrames = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }
  private stop() { cancelAnimationFrame(this.frameId); this.frameId = 0; }
  private visibilityChanged = () => {
    this.stop();
    if (!document.hidden) { this.nextGlitch = performance.now() + this.glitchDelay(); this.start(); }
  };
  private contextLost = (event: Event) => { event.preventDefault(); this.lost = true; this.stop(); this.callbacks.onContextLost(); };
  private contextRestored = () => { if (!this.disposed) this.callbacks.onContextRestored(); };

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    if (this.initialized) {
      this.app.canvas.removeEventListener("webglcontextlost", this.contextLost);
      this.app.canvas.removeEventListener("webglcontextrestored", this.contextRestored);
      this.scene?.destroy();
      this.bloomSprite?.destroy();
      if (this.crt) this.crt.resources.uBloom = Texture.EMPTY.source;
      this.crt?.destroy();
      this.bloomExtract?.destroy();
      this.blur?.destroy();
      this.app.destroy(true, { children: true });
      this.picture?.destroy(true);
      this.glow?.destroy(true);
      this.artwork?.destroy(true);
      this.logo?.destroy(true);
    }
  }
}
