import "server-only";

export interface HAConfig {
  baseUrl: URL;
  token: string;
  playerEntity: string;
  vinylSensor: string;
  reconnectBase: number;
  reconnectMax: number;
  artworkOrigins: Set<string>;
}

function delay(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function dataMode(): "homeassistant" | "mock" {
  return process.env.PVR_DATA_MODE === "mock" ? "mock"
    : process.env.PVR_DATA_MODE === "homeassistant" || process.env.HA_TOKEN ? "homeassistant" : "mock";
}

export function homeAssistantConfig(): { config?: HAConfig; error?: string } {
  const token = process.env.HA_TOKEN;
  if (!token || token.startsWith("op://")) return { error: "Home Assistant credentials are not loaded. Start the server through 1Password." };
  try {
    const baseUrl = new URL(process.env.HA_BASE_URL ?? "https://ha.home.arpa");
    if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error();
    baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");
    const playerEntity = process.env.HA_MEDIA_PLAYER_ENTITY_ID ?? "media_player.living_room_audio";
    const vinylSensor = process.env.HA_VINYL_SENSOR_ENTITY_ID ?? "binary_sensor.vinyl_listening_active";
    if (!/^media_player\.[a-z0-9_]+$/.test(playerEntity) || !/^binary_sensor\.[a-z0-9_]+$/.test(vinylSensor)) throw new Error();
    const artworkOrigins = new Set<string>();
    for (const value of (process.env.HA_ARTWORK_ORIGINS ?? "").split(",").map(v => v.trim()).filter(Boolean)) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error();
      artworkOrigins.add(url.origin);
    }
    return { config: {
      baseUrl, token, playerEntity, vinylSensor, artworkOrigins,
      reconnectBase: delay(process.env.HA_RECONNECT_BASE_MS, 1000, 500, 30_000),
      reconnectMax: delay(process.env.HA_RECONNECT_MAX_MS, 30_000, 1000, 120_000),
    } };
  } catch { return { error: "Check the Home Assistant URL, entity IDs, and artwork origins in the server configuration." }; }
}
