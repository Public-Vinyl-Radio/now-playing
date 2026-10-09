import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, renderResolution, sanitizePreferences } from "./preferences.ts";

test("corrupt or obsolete local preferences fall back to usable defaults", () => {
  assert.deepEqual(sanitizePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(sanitizePreferences("bad JSON value"), DEFAULT_PREFERENCES);
  const preferences = sanitizePreferences({ noise: NaN, bloom: Infinity, colorProfile: "cyan", motion: "false" });
  assert.deepEqual(preferences, DEFAULT_PREFERENCES);
});

test("restored parameters are clamped to safe renderer limits", () => {
  const preferences = sanitizePreferences({ renderScale: 10, fps: -1, curvature: -10, scanlines: 2, colorProfile: "amber", motion: false });
  assert.equal(preferences.renderScale, 1);
  assert.equal(preferences.fps, 15);
  assert.equal(preferences.curvature, 0);
  assert.equal(preferences.scanlines, 0.7);
  assert.equal(preferences.colorProfile, "amber");
  assert.equal(preferences.motion, false);
});

test("Retina and large displays obey the render target pixel budget", () => {
  for (const [width, height, dpr] of [[1180, 820, 2], [3840, 2160, 3], [800, 600, 1]]) {
    const resolution = renderResolution(width, height, dpr, 1);
    assert.ok(width * height * resolution * resolution <= 2_400_001);
    assert.ok(resolution <= Math.min(dpr, 2));
  }
});
