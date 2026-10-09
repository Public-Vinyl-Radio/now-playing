import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTime, playbackPosition, trackIdentity, type NowPlaying } from "./now-playing.ts";

const track: NowPlaying = { id: "test-track", title: "Friday Morning", artist: "Khruangbin", album: "Con Todo El Mundo", source: "vinyl", state: "playing", position: 60, duration: 410, positionUpdatedAt: 1_000 };

test("playing position advances, pauses stop it, and duration caps it", () => {
  assert.equal(playbackPosition(track, 11_000), 70);
  assert.equal(playbackPosition({ ...track, state: "paused" }, 11_000), 60);
  assert.equal(playbackPosition(track, 500_000), 410);
  assert.equal(playbackPosition(track, 0), 60);
});

test("missing vinyl timing stays missing", () => {
  assert.equal(playbackPosition({ ...track, position: undefined, duration: undefined }, 11_000), undefined);
  assert.equal(formatTime(undefined), "—:——");
});

test("progress, artwork, and connection updates do not change track identity", () => {
  assert.equal(trackIdentity(track), trackIdentity({ ...track, position: 85, artwork: "/new-cover.jpg", state: "disconnected" }));
  assert.notEqual(trackIdentity(track), trackIdentity({ ...track, id: "new-track", title: "Maria También" }));
});
