import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSource, isHAEntity, normalizeHA, type HAEntity } from "./ha-normalization.ts";
import { trackIdentity } from "./now-playing.ts";

const player: HAEntity = { entity_id: "media_player.living_room_audio", state: "playing", attributes: {
  media_title: "Friday Morning", media_artist: "Khruangbin", media_album_name: "Con Todo El Mundo",
  media_content_id: "https://upstream.example/track?access_token=private-upstream-value",
  media_duration: 410, media_position: 42, media_position_updated_at: "2026-10-08T20:00:00Z",
  entity_picture: "/api/media_player_proxy/media_player.living_room_audio?token=private-picture-value",
} };
const sensor = (state: string): HAEntity => ({ entity_id: "binary_sensor.vinyl_listening_active", state, attributes: {} });

test("the dedicated sensor distinguishes vinyl, streaming, and unknown sources", () => {
  assert.equal(detectSource(sensor("on")), "vinyl");
  assert.equal(detectSource(sensor("off")), "streaming");
  for (const state of ["unknown", "unavailable", "", "playing"]) assert.equal(detectSource(sensor(state)), "unknown");
  assert.equal(detectSource(undefined), "unknown");
});

test("HA metadata and timestamps normalize without exposing upstream access parameters", () => {
  const model = normalizeHA(player, sensor("on"), "/api/artwork?key=opaque-key");
  assert.equal(model.title, "Friday Morning");
  assert.equal(model.artist, "Khruangbin");
  assert.equal(model.album, "Con Todo El Mundo");
  assert.equal(model.duration, 410);
  assert.equal(model.position, 42);
  assert.equal(model.positionUpdatedAt, Date.parse("2026-10-08T20:00:00Z"));
  assert.equal(model.artwork, "/api/artwork?key=opaque-key");
  assert.ok(!JSON.stringify(model).includes("private-"));
});

test("release year and record label normalize from the selected media player's attributes", () => {
  for (const year of [2018, "2018", " 2018 "]) {
    const model = normalizeHA({ ...player, attributes: { ...player.attributes, year, label: " Dead Oceans " } }, sensor("on"));
    assert.equal(model.year, "2018");
    assert.equal(model.label, "Dead Oceans");
  }
});

test("missing and malformed release metadata stays absent", () => {
  for (const year of [undefined, null, "", " ", 0, "0", "0000", -2018, 2018.5, NaN, Infinity, true, {}, "unknown", "2018-01-01"]) {
    assert.equal(normalizeHA({ ...player, attributes: { year } }, sensor("on")).year, undefined);
  }
  for (const label of [undefined, null, "", " ", 42, true, {}, []]) {
    assert.equal(normalizeHA({ ...player, attributes: { label } }, sensor("on")).label, undefined);
  }
});

test("release metadata clears on a new track and updates without changing track identity", () => {
  const before = normalizeHA({ ...player, attributes: { ...player.attributes, year: 2018, label: "Dead Oceans" } }, sensor("on"));
  const updated = normalizeHA({ ...player, attributes: { ...player.attributes, year: 2019, label: "Night Time Stories" } }, sensor("on"));
  assert.equal(trackIdentity(before), trackIdentity(updated));
  assert.equal(updated.year, "2019");
  assert.equal(updated.label, "Night Time Stories");
  const next = normalizeHA({ ...player, attributes: { media_title: "Next Track" } }, sensor("on"));
  assert.equal(next.year, undefined);
  assert.equal(next.label, undefined);
});

test("idle, stopped, unavailable, and removed entities are handled explicitly", () => {
  for (const state of ["idle", "off", "standby"]) assert.equal(normalizeHA({ ...player, state }, sensor("off")).state, "idle");
  assert.equal(normalizeHA({ ...player, state: "paused" }, sensor("on")).state, "paused");
  assert.equal(normalizeHA({ ...player, state: "unavailable" }, sensor("off")).state, "unavailable");
  assert.equal(normalizeHA(undefined, undefined).state, "unavailable");
});

test("missing and malformed metadata never become invented album or progress values", () => {
  const model = normalizeHA({ ...player, attributes: { media_title: " ", media_artist: null, media_duration: -1, media_position: Infinity, media_position_updated_at: "invalid" } }, sensor("on"));
  for (const key of ["title", "artist", "album", "duration", "position", "positionUpdatedAt", "artwork"] as const) assert.equal(model[key], undefined);
});

test("position and source changes preserve track identity, while a new title changes it", () => {
  const before = normalizeHA(player, sensor("off"));
  const after = normalizeHA({ ...player, attributes: { ...player.attributes, media_position: 99, entity_picture: "/new-picture" } }, sensor("on"));
  assert.equal(trackIdentity(before), trackIdentity(after));
  assert.notEqual(trackIdentity(before), trackIdentity(normalizeHA({ ...player, attributes: { ...player.attributes, media_title: "Maria También" } }, sensor("on"))));
});

test("malformed entity payloads are rejected", () => {
  assert.ok(isHAEntity(player));
  for (const value of [null, {}, { ...player, attributes: [] }, { ...player, state: 4 }]) assert.ok(!isHAEntity(value));
});
