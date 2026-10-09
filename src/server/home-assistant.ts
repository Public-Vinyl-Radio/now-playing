import "server-only";
import { createHash } from "node:crypto";
import { isHAEntity, normalizeHA, type HAEntity } from "../lib/ha-normalization";
import { playbackPosition } from "../lib/now-playing";
import { WAITING_TRACK, type BroadcastSnapshot } from "../lib/broadcast";
import { ArtworkStore } from "./artwork";
import { homeAssistantConfig, type HAConfig } from "./config";

type Listener = (snapshot: BroadcastSnapshot) => void;

export class HomeAssistantBridge {
  readonly artwork: ArtworkStore;
  private player?: HAEntity;
  private sensor?: HAEntity;
  private playerVersion = 0;
  private sensorVersion = 0;
  private listeners = new Set<Listener>();
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private pongDeadline?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private messageId = 0;
  private subscriptionId = 0;
  private pingId = 0;
  private disposed = false;
  private started = false;
  snapshot: BroadcastSnapshot = { mode: "homeassistant", connection: "connecting", nowPlaying: { ...WAITING_TRACK }, receivedAt: Date.now() };

  constructor(private config: HAConfig) { this.artwork = new ArtworkStore(config); }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    if (!this.started) { this.started = true; this.connect(); }
    return () => { this.listeners.delete(listener); };
  }

  private emit(snapshot: BroadcastSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private publish() {
    const a = this.player?.attributes;
    const artwork = this.artwork.register(a?.entity_picture ?? a?.entity_picture_local);
    this.emit({ mode: "homeassistant", connection: "connected", nowPlaying: normalizeHA(this.player, this.sensor, artwork), receivedAt: Date.now() });
  }

  private connect() {
    if (this.disposed) return;
    const url = new URL(`${this.config.baseUrl.href.replace(/\/$/, "")}/api/websocket`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.socket = socket;
    this.messageId = 0;
    this.subscriptionId = 0;
    this.deadline = setTimeout(() => this.fail(socket, "Home Assistant did not respond. Reconnecting."), 15_000);
    this.deadline.unref();
    socket.addEventListener("error", () => this.fail(socket, "Home Assistant is unreachable. Reconnecting."));
    socket.addEventListener("close", () => this.fail(socket, "Home Assistant connection lost. Reconnecting."));
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || this.disposed || typeof event.data !== "string") return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "auth_required") socket.send(JSON.stringify({ type: "auth", access_token: this.config.token }));
      else if (message.type === "auth_invalid") this.fail(socket, "Home Assistant rejected the token. Check the server credentials.", true);
      else if (message.type === "auth_ok") {
        this.subscriptionId = ++this.messageId;
        socket.send(JSON.stringify({ id: this.subscriptionId, type: "subscribe_events", event_type: "state_changed" }));
      } else if (message.type === "result" && message.id === this.subscriptionId) {
        if (!message.success) { this.fail(socket, "Home Assistant subscription failed. Reconnecting."); return; }
        void this.loadInitial(socket);
      } else if (message.type === "pong" && message.id === this.pingId) clearTimeout(this.pongDeadline);
      else if (message.type === "event" && message.id === this.subscriptionId && message.event?.event_type === "state_changed") {
        const data = message.event.data;
        if (data?.entity_id === this.config.playerEntity) {
          this.player = isHAEntity(data.new_state) ? data.new_state : undefined;
          this.playerVersion++;
        } else if (data?.entity_id === this.config.vinylSensor) {
          this.sensor = isHAEntity(data.new_state) ? data.new_state : undefined;
          this.sensorVersion++;
        } else return;
        if (this.snapshot.connection === "connected") this.publish();
      }
    });
  }

  private async loadInitial(socket: WebSocket) {
    const playerVersion = this.playerVersion, sensorVersion = this.sensorVersion;
    try {
      const [player, sensor] = await Promise.all([this.fetchEntity(this.config.playerEntity), this.fetchEntity(this.config.vinylSensor)]);
      if (this.disposed || this.socket !== socket) return;
      // A state_changed event received during the initial reads takes precedence.
      if (this.playerVersion === playerVersion) this.player = player;
      if (this.sensorVersion === sensorVersion) this.sensor = sensor;
      clearTimeout(this.deadline);
      this.attempt = 0;
      this.publish();
      this.heartbeat = setInterval(() => {
        if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
        this.pingId = ++this.messageId;
        socket.send(JSON.stringify({ id: this.pingId, type: "ping" }));
        this.pongDeadline = setTimeout(() => this.fail(socket, "Home Assistant stopped responding. Reconnecting."), 10_000);
        this.pongDeadline.unref();
      }, 20_000);
      this.heartbeat.unref();
    } catch { this.fail(socket, "Could not read the configured Home Assistant entities. Reconnecting."); }
  }

  private async fetchEntity(entity: string) {
    const url = `${this.config.baseUrl.href.replace(/\/$/, "")}/api/states/${encodeURIComponent(entity)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error("Entity read failed");
    const entityState: unknown = await response.json();
    return isHAEntity(entityState) && entityState.entity_id === entity ? entityState : undefined;
  }

  private clearTimers() {
    clearTimeout(this.deadline);
    clearInterval(this.heartbeat);
    clearTimeout(this.pongDeadline);
  }

  private fail(socket: WebSocket, message: string, credentialsRejected = false) {
    if (this.disposed || this.socket !== socket) return;
    this.socket = undefined;
    this.clearTimers();
    try { socket.close(); } catch { /* The socket may already be closed. */ }
    const now = Date.now();
    const track = this.snapshot.nowPlaying;
    this.emit({
      mode: "homeassistant", connection: credentialsRejected ? "error" : "reconnecting", message,
      nowPlaying: { ...track, state: "disconnected", position: playbackPosition(track, now), positionUpdatedAt: now }, receivedAt: now,
    });
    const base = Math.min(this.config.reconnectMax, this.config.reconnectBase * 2 ** Math.min(this.attempt++, 8));
    const delay = Math.min(this.config.reconnectMax, base * (0.8 + Math.random() * 0.4));
    this.retry = setTimeout(() => this.connect(), credentialsRejected ? Math.max(delay, 30_000) : delay);
    this.retry.unref();
  }

  destroy() {
    this.disposed = true;
    clearTimeout(this.retry);
    this.clearTimers();
    this.socket?.close();
    this.listeners.clear();
  }
}

interface BridgeEntry { fingerprint: string; bridge: HomeAssistantBridge }
const shared = globalThis as typeof globalThis & { __pvrBridge?: BridgeEntry };

export function getHomeAssistant(): { bridge?: HomeAssistantBridge; error?: string } {
  const { config, error } = homeAssistantConfig();
  if (!config) return { error };
  const fingerprint = createHash("sha256").update(JSON.stringify([config.baseUrl.href, config.playerEntity, config.vinylSensor, config.token, [...config.artworkOrigins], config.reconnectBase, config.reconnectMax])).digest("hex");
  if (shared.__pvrBridge?.fingerprint !== fingerprint) {
    shared.__pvrBridge?.bridge.destroy();
    shared.__pvrBridge = { fingerprint, bridge: new HomeAssistantBridge(config) };
  }
  return { bridge: shared.__pvrBridge.bridge };
}
