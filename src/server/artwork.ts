import "server-only";
import { createHash } from "node:crypto";
import type { HAConfig } from "./config";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export class ArtworkStore {
  private sources = new Map<string, URL>();
  private cache = new Map<string, { bytes: Uint8Array; type: string; expires: number }>();
  private inFlight = new Map<string, Promise<{ bytes: Uint8Array; type: string }>>();
  private config: HAConfig;
  private fetchImage: typeof fetch;

  constructor(config: HAConfig, fetchImage: typeof fetch = fetch) {
    this.config = config;
    this.fetchImage = fetchImage;
  }

  private permitted(url: URL) {
    if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) return false;
    if (url.origin === this.config.baseUrl.origin) return true;
    return url.protocol === "https:" && this.config.artworkOrigins.has(url.origin);
  }

  register(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try {
      const url = new URL(value, `${this.config.baseUrl.href.replace(/\/$/, "")}/`);
      if (!this.permitted(url)) return undefined;
      const key = createHash("sha256").update(url.href).digest("hex").slice(0, 32);
      // Keep recently used sleeves registered when returning to an earlier track.
      this.sources.delete(key);
      this.sources.set(key, url);
      while (this.sources.size > 4) {
        const oldest = this.sources.keys().next().value!;
        this.sources.delete(oldest);
        this.cache.delete(oldest);
      }
      return `/api/artwork?key=${key}`;
    } catch { return undefined; }
  }

  async load(key: string) {
    const source = this.sources.get(key);
    if (!source) return undefined;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const task = this.retrieve(source).then(result => {
      if (this.sources.has(key)) this.cache.set(key, { ...result, expires: Date.now() + 60_000 });
      return result;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private async retrieve(source: URL) {
    let url = source;
    const signal = AbortSignal.timeout(12_000);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!this.permitted(url)) throw new Error("Artwork origin not configured");
      const headers: Record<string, string> = { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" };
      // Never send HA's bearer token to another origin, including after redirects.
      if (url.origin === this.config.baseUrl.origin) headers.Authorization = `Bearer ${this.config.token}`;
      const response = await this.fetchImage(url, { headers, redirect: "manual", cache: "no-store", signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("Invalid artwork redirect");
        url = new URL(location, url);
        continue;
      }
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!response.ok || !ALLOWED_TYPES.has(type) || Number(response.headers.get("content-length")) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error("Artwork unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty artwork");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Artwork exceeds size limit"); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { bytes, type };
    }
    throw new Error("Too many artwork redirects");
  }
}
