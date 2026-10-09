import { getHomeAssistant } from "@/server/home-assistant";
import { sameOriginRequest } from "@/server/request-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!sameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response("Artwork not found", { status: 404 });
  const { bridge } = getHomeAssistant();
  if (!bridge) return new Response("Artwork unavailable", { status: 503 });
  try {
    const result = await bridge.artwork.load(key);
    if (!result) return new Response("Artwork no longer available", { status: 410 });
    return new Response(result.bytes.slice().buffer as ArrayBuffer, { headers: {
      "Content-Type": result.type,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new Response("Artwork unavailable", { status: 502 }); }
}
