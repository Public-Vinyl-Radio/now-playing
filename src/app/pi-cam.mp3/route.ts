import { listen } from "@/server/live-audio";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return listen(request, "pi-cam"); }
