import { test } from "node:test";
import assert from "node:assert/strict";
import { ArtworkStore } from "./artwork.ts";
import type { HAConfig } from "./config.ts";

const config: HAConfig = { baseUrl: new URL("https://ha.example"), token: "fixture-only-secret", playerEntity: "media_player.test", vinylSensor: "binary_sensor.test", reconnectBase: 1000, reconnectMax: 30_000, artworkOrigins: new Set(["https://covers.example"]) };
const keyFrom = (path: string) => new URL(path, "https://display.example").searchParams.get("key")!;

test("artwork references are opaque and arbitrary unregistered URLs cannot be fetched", async () => {
  let requests = 0;
  const store = new ArtworkStore(config, async () => { requests++; return new Response(); });
  const path = store.register("/api/media_player_proxy/media_player.test?token=private-picture-value")!;
  assert.match(path, /^\/api\/artwork\?key=[a-f0-9]{32}$/);
  assert.ok(!path.includes("private-picture-value"));
  assert.equal(await store.load("unknown"), undefined);
  assert.equal(store.register("file:///etc/passwd"), undefined);
  assert.equal(store.register("https://unconfigured.example/art.jpg"), undefined);
  assert.equal(requests, 0);
});

test("redirected external covers do not receive Home Assistant credentials", async () => {
  const seen: { url: string; authorization: string | null }[] = [];
  const store = new ArtworkStore(config, async (input, init) => {
    const url = String(input);
    seen.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
    return seen.length === 1 ? new Response(null, { status: 302, headers: { location: "https://covers.example/art.png" } })
      : new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
  });
  const key = keyFrom(store.register("/artwork")!);
  assert.equal((await store.load(key))?.type, "image/png");
  assert.equal(seen[0].authorization, "Bearer fixture-only-secret");
  assert.equal(seen[1].authorization, null);
  await store.load(key);
  assert.equal(seen.length, 2, "a repeated request should use the bounded cache");
});

test("unapproved redirects, HTML responses, and oversized images are rejected", async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: "https://unconfigured.example/art.png" } }),
    new Response("login page", { headers: { "Content-Type": "text/html" } }),
    new Response(null, { headers: { "Content-Type": "image/png", "Content-Length": String(9 * 1024 * 1024) } }),
  ]) {
    let requests = 0;
    const store = new ArtworkStore(config, async () => { requests++; return response; });
    await assert.rejects(store.load(keyFrom(store.register("/artwork")!))!);
    assert.equal(requests, 1);
  }
});

test("recently reused artwork survives eviction while the registration cache stays bounded", async () => {
  const store = new ArtworkStore(config, async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png" } }));
  const first = keyFrom(store.register("/first.png")!);
  const second = keyFrom(store.register("/second.png")!);
  store.register("/third.png");
  store.register("/fourth.png");
  store.register("/first.png");
  store.register("/fifth.png");
  assert.ok(await store.load(first));
  assert.equal(await store.load(second), undefined);
});
