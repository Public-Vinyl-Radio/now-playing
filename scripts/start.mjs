import { cp, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { port: { type: "string" }, hostname: { type: "string" } } });
const standalone = resolve(".next/standalone");
try { await access(resolve(standalone, "server.js")); }
catch { console.error("Build the application first with npm run build."); process.exit(1); }
await cp(resolve("public"), resolve(standalone, "public"), { recursive: true });
await cp(resolve(".next/static"), resolve(standalone, ".next/static"), { recursive: true });
process.env.PORT = values.port ?? process.env.PORT ?? "3000";
process.env.HOSTNAME = values.hostname ?? "0.0.0.0";
await import(pathToFileURL(resolve(standalone, "server.js")).href);
