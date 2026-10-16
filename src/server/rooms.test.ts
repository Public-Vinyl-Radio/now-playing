import test from "node:test";
import assert from "node:assert/strict";
import { homeAssistantConfig } from "./config.ts";
import { getHomeAssistant } from "./home-assistant.ts";

test("each room has its own HA player, sensor, bridge, and artwork registry", async () => {
  const original = process.env.HA_TOKEN;
  process.env.HA_TOKEN = "fixture-token";
  try {
    assert.equal(homeAssistantConfig("living-room").config?.playerEntity, "media_player.living_room_audio");
    assert.equal(homeAssistantConfig("lounge").config?.playerEntity, "media_player.lounge_audio");
    assert.equal(homeAssistantConfig("lounge").config?.vinylSensor, "binary_sensor.lounge_vinyl_audio_activity");
    const living = getHomeAssistant("living-room").bridge!;
    const lounge = getHomeAssistant("lounge").bridge!;
    assert.notEqual(living, lounge);
    assert.equal(getHomeAssistant("lounge").bridge, lounge);
    assert.equal(getHomeAssistant("living-room").bridge, living);
    const path = lounge.artwork.register("/api/cover/lounge.jpg")!;
    assert.match(path, /room=lounge/);
    const key = new URL(path, "http://site").searchParams.get("key")!;
    assert.equal(await living.artwork.load(key), undefined);
    living.destroy();
    lounge.destroy();
  } finally {
    if (original === undefined) delete process.env.HA_TOKEN;
    else process.env.HA_TOKEN = original;
  }
});
