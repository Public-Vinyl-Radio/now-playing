import { CanvasTextMetrics, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { formatTime, playbackPosition, type NowPlaying } from "../lib/now-playing";
import { ProceduralSignal, type SignalSource } from "./signal";
import { fitMetadata, marqueeOffset } from "./metadata";

const C = { background: 0x121511, ivory: 0xf0e7ce, muted: 0x969b85, amber: 0xd9a361, green: 0xa8b797, rule: 0x42483b };

export class NowPlayingScene {
  readonly container = new Container();
  private signalGraphic?: Graphics;
  private progressGraphic?: Graphics;
  private elapsedText?: Text;
  private clockText?: Text;
  private lastSecond = -1;
  private rightX = 0;
  private rightWidth = 0;
  private progressY = 0;
  private signalY = 0;
  private signalHeight = 0;
  private track: NowPlaying;
  private scale = 1;
  private broadcastLabel = "CONNECTING";
  private titleMotion = true;
  private titleMarquee?: { content: Container; chunks: Text[]; distance: number; startedAt?: number };

  constructor(track: NowPlaying, private artwork?: Texture, private logo?: Texture, private signal: SignalSource = new ProceduralSignal()) {
    this.track = track;
  }

  setBroadcastLabel(label: string) { this.broadcastLabel = label; }

  setTitleMotion(enabled: boolean, width: number, height: number) {
    if (enabled === this.titleMotion) return;
    this.titleMotion = enabled;
    if (width > 0 && height > 0) this.layout(width, height);
  }

  setArtwork(artwork: Texture | undefined, width: number, height: number) {
    this.artwork = artwork;
    this.layout(width, height);
  }

  setTrack(track: NowPlaying, width: number, height: number, rebuild = true) {
    this.track = track;
    this.lastSecond = -1;
    if (rebuild) this.layout(width, height);
  }

  private text(value: string, x: number, y: number, size: number, options: { color?: number; serif?: boolean; spacing?: number; width?: number; align?: "left" | "right"; lineHeight?: number } = {}) {
    const text = new Text({
      text: value,
      resolution: 2,
      style: {
        fontFamily: options.serif ? "Libre Caslon Display" : "DM Mono",
        fontSize: size,
        fill: options.color ?? C.ivory,
        letterSpacing: options.spacing ?? 0,
        wordWrap: !!options.width,
        wordWrapWidth: options.width,
        breakWords: true,
        lineHeight: options.lineHeight ?? size * (options.serif ? 0.99 : 1.3),
      },
    });
    text.position.set(x, y);
    if (options.align === "right") text.anchor.x = 1;
    this.container.addChild(text);
    return text;
  }

  private metadata(value: string, size: number, minimumSize: number, maxHeight: number, spacing = 0) {
    return fitMetadata(value, size, minimumSize, this.rightWidth, maxHeight, (text, fontSize) =>
      CanvasTextMetrics.measureText(text, new TextStyle({
        fontFamily: "DM Mono", fontSize, letterSpacing: spacing,
        wordWrap: true, wordWrapWidth: this.rightWidth, breakWords: true, lineHeight: fontSize * 1.15,
      })));
  }

  layout(width: number, height: number) {
    this.titleMarquee = undefined;
    for (const child of this.container.removeChildren()) child.destroy({ children: true });
    // A landscape composition scales as one picture, with a compact portrait fallback.
    this.scale = Math.min(width / 1440, height / 960);
    const s = this.scale;
    const safe = Math.max(width * 0.058, 40 * s);
    const top = Math.max(46 * s, height * 0.047);
    const graphics = new Graphics().rect(0, 0, width, height).fill(C.background);
    this.container.addChild(graphics);

    if (this.logo) {
      const mark = new Sprite(this.logo);
      mark.height = 70 * s;
      mark.width = mark.height * this.logo.width / this.logo.height;
      mark.tint = C.ivory;
      mark.position.set(safe, top - 10 * s);
      this.container.addChild(mark);
    } else {
      this.text("PVR", safe, top - 12 * s, 74 * s, { serif: true });
    }
    const onAirX = width - safe;
    const indicator = { playing: "ON AIR", paused: "PAUSED", idle: "STANDBY", unavailable: "UNAVAILABLE", disconnected: "NO SIGNAL" }[this.track.state];
    const indicatorText = this.text(indicator, onAirX, top + 9 * s, 18 * s, { color: this.track.state === "playing" ? C.amber : C.muted, spacing: 2 * s, align: "right" });
    graphics.circle(onAirX - indicatorText.width - 18 * s, top + 22 * s, 4 * s).fill(this.track.state === "playing" ? C.amber : C.rule);
    const headerY = top + 87 * s;
    graphics.moveTo(safe, headerY).lineTo(width - safe, headerY).stroke({ color: C.rule, width: s });

    if (this.track.state === "idle" || this.track.state === "unavailable" || (this.track.state === "disconnected" && !this.track.title && !this.track.artist)) {
      this.stationScreen(width, height, safe, s, graphics);
      this.lastSecond = -1;
      this.elapsedText = undefined;
      this.progressGraphic = undefined;
      this.signalGraphic = undefined;
      this.update(0, Date.now());
      return;
    }

    const portrait = height > width * 1.1;
    const artY = headerY + 69 * s;
    const artSize = portrait ? Math.min(width - safe * 2, height * 0.35) : Math.min(width * 0.4, height * 0.56);
    const artX = portrait ? (width - artSize) / 2 : safe;
    if (this.artwork) {
      const sprite = new Sprite(this.artwork);
      sprite.position.set(artX, artY);
      sprite.width = artSize;
      sprite.height = artSize;
      this.container.addChild(sprite);
    } else {
      const fallback = new Graphics().rect(artX, artY, artSize, artSize).fill(0x23291f);
      for (let r = artSize * 0.44; r > artSize * 0.08; r -= artSize * 0.035) {
        fallback.circle(artX + artSize / 2, artY + artSize / 2, r).stroke({ color: C.muted, alpha: 0.25, width: s });
      }
      this.container.addChild(fallback);
      this.text("PVR", artX + artSize * 0.37, artY + artSize * 0.43, artSize * 0.13, { serif: true });
    }
    const catalogY = artY + artSize + 22 * s;
    const year = this.text(this.track.year ?? "", artX + artSize, catalogY, 24 * s, { color: C.muted, align: "right" });
    const catalogWidth = artSize - (this.track.year ? year.width + 16 * s : 0);
    const catalog = fitMetadata(this.track.catalog ?? "PUBLIC VINYL RADIO", 24 * s, 24 * s, catalogWidth, 62.4 * s,
      (text, fontSize) => CanvasTextMetrics.measureText(text, new TextStyle({
        fontFamily: "DM Mono", fontSize, letterSpacing: 0.6 * s, lineHeight: fontSize * 1.3,
        wordWrap: true, wordWrapWidth: catalogWidth, breakWords: true,
      })));
    this.text(catalog.value, artX, catalogY, catalog.size, { color: C.muted, spacing: 0.6 * s, width: catalogWidth });

    this.rightX = portrait ? safe : artX + artSize + 78 * s;
    this.rightWidth = width - safe - this.rightX;
    const metadataY = portrait ? artY + artSize + 79 * s : artY + 13 * s;
    const sourceLabel = this.track.source === "streaming" ? "STREAMING / DIGITAL TRANSMISSION" : "NOW PLAYING";
    const source = this.track.source === "vinyl" ? undefined
      : this.text(sourceLabel, this.rightX, metadataY, 12 * s, { color: C.amber, spacing: 1 * s, width: this.rightWidth });
    const footerY = height - Math.max(91 * s, height * 0.09);
    const metadataTop = Math.max(metadataY + 31 * s, source ? source.y + source.height + 24 * s : 0);
    // Reserve room for track, progress, signal and clock before the footer.
    const metadataHeight = Math.max(0, footerY - 262 * s - metadataTop);
    const secondaryHeight = Math.min(86.4 * s, metadataHeight * 0.24);
    const artist = this.metadata((this.track.artist ?? "").toUpperCase(), 36 * s, 32 * s, secondaryHeight, 3 * s);
    const album = this.metadata(this.track.album ?? "", 36 * s, 32 * s, secondaryHeight);
    const titleGap = artist.value && this.track.title ? 16 * s : 0;
    const albumGap = album.value && (artist.value || this.track.title) ? 24 * s : 0;
    const titleValue = this.track.title ?? "";
    const titleHeight = Math.max(0, metadataHeight - artist.height - album.height - titleGap - albumGap);
    const fullSizeTitle = this.metadata(titleValue, 96 * s, 96 * s, titleHeight);
    const title = fullSizeTitle.value ? fullSizeTitle : this.metadata(titleValue, 96 * s, 56 * s, titleHeight);
    const marqueeHeight = 96 * s * 1.15;
    const scrollTitle = this.titleMotion && titleValue.length > 0 && fullSizeTitle.value !== titleValue && marqueeHeight <= titleHeight;
    let metadataBottom = metadataTop;
    if (artist.value) {
      this.text(artist.value, this.rightX, metadataBottom, artist.size, { spacing: 3 * s, width: this.rightWidth, lineHeight: artist.size * 1.15 });
      metadataBottom += artist.height;
    }
    if (scrollTitle) {
      metadataBottom += titleGap;
      const slotHeight = Math.max(title.height, marqueeHeight);
      const viewport = new Container();
      viewport.position.set(this.rightX, metadataBottom);
      const mask = new Graphics().rect(0, 0, this.rightWidth, slotHeight).fill(0xffffff);
      viewport.addChild(mask);
      viewport.mask = mask;
      const content = new Container();
      content.y = (slotHeight - marqueeHeight) / 2;
      viewport.addChild(content);
      this.container.addChild(viewport);
      // Small chunks avoid oversized text textures on the iPad for very long titles.
      const characters = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" })
        .segment(titleValue.replace(/\s+/g, " ")), ({ segment }) => segment);
      const chunks: Text[] = [];
      let length = 0;
      for (let index = 0; index < characters.length; index += 20) {
        const chunk = this.text(characters.slice(index, index + 20).join(""), length, 0, 96 * s, { lineHeight: marqueeHeight });
        content.addChild(chunk);
        length += chunk.width;
        chunks.push(chunk);
      }
      this.titleMarquee = { content, chunks, distance: Math.max(0, length - this.rightWidth) };
      metadataBottom += slotHeight;
    } else if (title.value) {
      metadataBottom += titleGap;
      this.text(title.value, this.rightX, metadataBottom, title.size, { width: this.rightWidth, lineHeight: title.size * 1.15 });
      metadataBottom += title.height;
    }
    if (album.value) {
      metadataBottom += albumGap;
      this.text(album.value, this.rightX, metadataBottom, album.size, { color: C.muted, width: this.rightWidth, lineHeight: album.size * 1.15 });
      metadataBottom += album.height;
    }
    this.text(this.track.trackNumber ? `TRACK ${this.track.trackNumber}` : "", this.rightX, metadataBottom + 18 * s, 24 * s, { color: C.muted, spacing: 1.4 * s });

    this.progressY = metadataBottom + 108 * s;
    this.elapsedText = this.text("", this.rightX, this.progressY - 36 * s, 24 * s, { color: C.green });
    this.text(this.track.duration !== undefined ? formatTime(this.track.duration) : this.track.source === "vinyl" ? "LIVE VINYL" : "", this.rightX + this.rightWidth, this.progressY - 36 * s, 24 * s, { color: C.muted, align: "right" });
    this.progressGraphic = new Graphics();
    this.container.addChild(this.progressGraphic);
    this.signalY = this.progressY + 65 * s;
    this.signalHeight = 24 * s;
    this.signalGraphic = new Graphics();
    this.container.addChild(this.signalGraphic);

    graphics.moveTo(safe, footerY).lineTo(width - safe, footerY).stroke({ color: C.rule, width: s });
    this.text("THE FUTURE IS ANALOG", safe, footerY + 23 * s, 22 * s, { color: C.muted, spacing: 1.1 * s });
    this.text("PUBLIC VINYL RADIO", width - safe, footerY + 23 * s, 22 * s, { color: C.muted, spacing: 1.1 * s, align: "right" });
    this.clockText = this.text("", width - safe, footerY - 30 * s, 11 * s, { color: C.muted, align: "right" });
    this.lastSecond = -1;
    this.update(0, Date.now());
  }

  private stationScreen(width: number, height: number, safe: number, s: number, graphics: Graphics) {
    if (this.logo) {
      const mark = new Sprite(this.logo);
      mark.width = Math.min(width * 0.44, 540 * s);
      mark.height = mark.width * this.logo.height / this.logo.width;
      mark.tint = C.ivory;
      mark.position.set((width - mark.width) / 2, height * 0.36);
      this.container.addChild(mark);
    } else {
      const mark = this.text("PVR", 0, height * 0.33, 180 * s, { serif: true });
      mark.x = (width - mark.width) / 2;
    }
    const station = this.text("PUBLIC VINYL RADIO", 0, height * 0.58, 19 * s, { spacing: 4 * s });
    station.x = (width - station.width) / 2;
    const message = this.track.state === "idle" ? "THE NEXT RECORD IS ON ITS WAY"
      : this.track.state === "unavailable" ? "THE MEDIA PLAYER IS UNAVAILABLE" : "WAITING FOR THE BROADCAST SIGNAL";
    const caption = this.text(message, 0, height * 0.66, 12 * s, { color: C.muted, spacing: 1.2 * s });
    caption.x = (width - caption.width) / 2;
    const footerY = height - Math.max(91 * s, height * 0.09);
    graphics.moveTo(safe, footerY).lineTo(width - safe, footerY).stroke({ color: C.rule, width: s });
    this.text("THE FUTURE IS ANALOG", safe, footerY + 23 * s, 22 * s, { color: C.muted, spacing: 1.1 * s });
    this.text("PUBLIC VINYL RADIO", width - safe, footerY + 23 * s, 22 * s, { color: C.muted, spacing: 1.1 * s, align: "right" });
    this.clockText = this.text("", width - safe, footerY - 30 * s, 11 * s, { color: C.muted, align: "right" });
  }

  update(time: number, now: number) {
    if (this.titleMarquee) {
      const marquee = this.titleMarquee;
      if (time <= 0) marquee.startedAt = undefined;
      else marquee.startedAt ??= time;
      marquee.content.x = -marqueeOffset(time - (marquee.startedAt ?? time), marquee.distance, 36 * this.scale);
      for (const chunk of marquee.chunks) {
        const x = marquee.content.x + chunk.x;
        chunk.renderable = x + chunk.width > 0 && x < this.rightWidth;
      }
    }
    const second = Math.floor(now / 1000);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      const position = playbackPosition(this.track, now);
      if (this.elapsedText) this.elapsedText.text = position === undefined ? "NO TIMING DATA" : formatTime(position);
      if (this.clockText) this.clockText.text = new Date(now).toLocaleTimeString("en-GB", { hour12: false });
      this.progressGraphic?.clear();
      if (this.progressGraphic && this.track.duration && position !== undefined) {
        this.progressGraphic.rect(this.rightX, this.progressY, this.rightWidth, this.scale).fill(C.rule);
        const length = Math.max(0, Math.min(1, position / this.track.duration)) * this.rightWidth;
        this.progressGraphic.rect(this.rightX, this.progressY, length, 2 * this.scale).fill(C.green);
        this.progressGraphic.circle(this.rightX + length, this.progressY + this.scale, 3 * this.scale).fill(C.green);
      }
    }
    if (this.track.state === "idle" || this.track.state === "unavailable" || (this.track.state === "disconnected" && !this.track.title && !this.track.artist)) return;
    const g = this.signalGraphic?.clear();
    if (!g) return;
    g.moveTo(this.rightX, this.signalY).lineTo(this.rightX + this.rightWidth, this.signalY).stroke({ color: C.rule, width: this.scale, alpha: 0.55 });
    for (let i = 0; i <= 180; i++) {
      const x = this.rightX + i / 180 * this.rightWidth;
      const y = this.signalY + (this.track.state === "playing" ? this.signal.sample(time, i, 180) * this.signalHeight : 0);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke({ color: C.green, width: 1.3 * this.scale, alpha: 0.7 });
  }

  destroy() { this.container.destroy({ children: true }); }
}
