import { mockTrack } from "@/lib/mock-data";
import { WAITING_TRACK, type BroadcastSnapshot } from "@/lib/broadcast";
import { dataMode } from "@/server/config";
import { getHomeAssistant } from "@/server/home-assistant";
import { sameOriginRequest } from "@/server/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!sameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
  const query = new URL(request.url).searchParams;
  const mode = query.get("mode") === "mock" ? "mock" : dataMode();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try { controller.close(); } catch { /* Consumer already cancelled. */ }
      };
      const write = (value: string) => {
        if (closed) return;
        // Bound buffering when a device stops consuming the connection.
        if ((controller.desiredSize ?? 1) <= 0) { cleanup(); return; }
        try { controller.enqueue(encoder.encode(value)); } catch { cleanup(); }
      };
      const send = (snapshot: BroadcastSnapshot) => write(`event: broadcast\ndata: ${JSON.stringify(snapshot)}\n\n`);
      write("retry: 2000\n\n");
      if (mode === "mock") {
        const index = Number(query.get("preview") ?? 0);
        send({ mode: "mock", connection: "connected", nowPlaying: mockTrack(Number.isInteger(index) && index >= 0 && index < 3 ? index : 0), receivedAt: Date.now() });
      } else {
        const { bridge, error } = getHomeAssistant();
        if (bridge) unsubscribe = bridge.subscribe(send);
        else send({ mode: "homeassistant", connection: "unconfigured", nowPlaying: { ...WAITING_TRACK }, message: error, receivedAt: Date.now() });
      }
      heartbeat = setInterval(() => write(": heartbeat\n\n"), 15_000);
      heartbeat.unref();
      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) cleanup();
    },
    cancel() { cleanup(); },
  }, { highWaterMark: 8 });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  } });
}
