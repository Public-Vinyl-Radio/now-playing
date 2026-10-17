import test from "node:test";
import assert from "node:assert/strict";
import { listen, liveAudioOrigin, streamStatuses } from "./live-audio.ts";

function configure(context: import("node:test").TestContext) {
  const previous = process.env.PVR_AUDIO_BASE_URL;
  process.env.PVR_AUDIO_BASE_URL = "http://audio.internal:8081";
  context.after(() => {
    if (previous === undefined) delete process.env.PVR_AUDIO_BASE_URL;
    else process.env.PVR_AUDIO_BASE_URL = previous;
  });
}

test("room statuses follow their own source without sending control commands", async context => {
  configure(context);
  context.mock.method(globalThis, "fetch", async (input: URL, options: RequestInit) => {
    assert.equal(input.href, "http://audio.internal:8081/healthz");
    assert.equal(options.method, undefined);
    return Response.json({ sources: { "pi-cam": { enabled: true, streaming: true }, aswitch: { enabled: false, streaming: false } } });
  });
  assert.deepEqual(await streamStatuses(), { "living-room": "off", lounge: "live" });
});

test("missing or unreachable sources report unavailable rather than off air", async context => {
  configure(context);
  context.mock.method(globalThis, "fetch", async () => Response.json({ sources: {} }));
  assert.deepEqual(await streamStatuses(), { "living-room": "unavailable", lounge: "unavailable" });
  context.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await streamStatuses()).lounge, "unavailable");
});

test("proxy allows a long live stream and propagates the listener disconnect", async context => {
  configure(context);
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  context.mock.method(globalThis, "fetch", async (input: URL, options: RequestInit) => {
    assert.equal(input.pathname, "/pi-cam.mp3");
    signal = options.signal!;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); } }), { headers: { "Content-Type": "audio/mpeg" } });
  });
  const controller = new AbortController();
  const response = await listen(new Request("http://site/pi-cam.mp3", { signal: controller.signal }), "pi-cam");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  context.mock.timers.tick(60_000);
  assert.equal(signal?.aborted, false, "The header timeout must not cut off an established stream");
  const reader = response.body!.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2, 3]));
  controller.abort();
  assert.equal(signal?.aborted, true);
  await reader.cancel();
});

test("off-air and cross-site requests cannot become audio or control requests", async context => {
  configure(context);
  const fetch = context.mock.method(globalThis, "fetch", async () => new Response("off", { status: 503 }));
  assert.equal((await listen(new Request("http://site/aswitch.mp3"), "aswitch")).status, 503);
  const crossSite = new Request("http://site/pi-cam.mp3", { headers: { "sec-fetch-site": "cross-site" } });
  assert.equal((await listen(crossSite, "pi-cam")).status, 403);
  assert.equal(fetch.mock.callCount(), 1);
});

test("the private audio origin cannot contain credentials or a path", context => {
  configure(context);
  for (const value of ["http://user:secret@audio", "http://audio/arbitrary", "file:///tmp/audio"]) {
    process.env.PVR_AUDIO_BASE_URL = value;
    assert.throws(() => liveAudioOrigin());
  }
});
