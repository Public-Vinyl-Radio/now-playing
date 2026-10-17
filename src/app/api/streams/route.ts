import { streamStatuses } from "@/server/live-audio";
import { sameOriginRequest } from "@/server/request-policy";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!sameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
  return Response.json(await streamStatuses(), { headers: { "Cache-Control": "no-store" } });
}
