import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { delay, fail, readState, repoRoot, report, writeState } from "./lib.mjs";

async function available(port) {
  return new Promise(resolve => {
    const socket = createServer();
    socket.once("error", () => resolve(false));
    socket.listen({ host: "0.0.0.0", port, exclusive: true }, () => socket.close(() => resolve(true)));
  });
}

async function main() {
  const root = repoRoot();
  const task = readState(root);
  if (process.argv[2] !== "--task-id" || process.argv[3] !== task.id || task.worktreePath !== root) fail("Preview must be launched by its owning Herdr task");
  const hash = createHash("sha256").update(root).digest().readUInt32BE(0);
  const first = task.port ?? 4100 + hash % 900;
  const addresses = [...new Set(Object.values(networkInterfaces()).flat().filter(address => address && !address.internal && address.family === "IPv4").map(address => address.address))];
  const environment = { ...process.env, PVR_DATA_MODE: "mock", PVR_DEV_ORIGINS: addresses.join(","), NEXT_TELEMETRY_DISABLED: "1" };
  delete environment.HA_TOKEN;
  let child, stopping = false;
  const record = value => writeState(root, "preview", { taskId: task.id, pid: process.pid, ...value });
  const signalChild = signal => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      signalChild("SIGTERM");
      const timer = setTimeout(() => signalChild("SIGKILL"), 5000);
      timer.unref();
    });
  }
  try {
    for (let attempt = 0; attempt < (task.port ? 1 : 50); attempt++) {
      if (stopping) return;
      const port = task.port ?? 4100 + (first - 4100 + attempt) % 900;
      if (!await available(port)) continue;
      record({ status: "starting", port });
      console.log(`PVR mock preview: http://localhost:${port}`);
      let output = "", exited = false, readySignal = false;
      child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "0.0.0.0"], {
        cwd: root, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
      const collect = (stream, destination) => stream.on("data", chunk => {
        destination.write(chunk);
        output = (output + chunk.toString()).slice(-8192);
        if (/Ready in/.test(output)) readySignal = true;
      });
      collect(child.stdout, process.stdout);
      collect(child.stderr, process.stderr);
      let spawnError;
      const closed = new Promise(resolve => {
        child.once("error", error => { spawnError = error; exited = true; resolve(1); });
        child.once("close", code => { exited = true; resolve(code ?? 1); });
      });
      const deadline = Date.now() + 90_000;
      let ready = false;
      while (!exited && !stopping && Date.now() < deadline) {
        if (readySignal) {
          try {
            const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(10_000) });
            await response.body?.cancel();
            if (response.ok && !exited && !stopping) { ready = true; break; }
          } catch { /* Next may still be compiling its first route. */ }
        }
        await delay(250);
      }
      if (ready) {
        record({ status: "ready", port, url: `http://localhost:${port}`, networkUrls: addresses.map(address => `http://${address}:${port}`) });
        const code = await closed;
        signalChild("SIGTERM");
        if (!stopping) fail(`Preview exited with ${code}. Inspect its tab.`);
        return;
      }
      signalChild("SIGTERM");
      const kill = setTimeout(() => signalChild("SIGKILL"), 5000);
      kill.unref();
      await closed;
      clearTimeout(kill);
      if (stopping) return;
      if (spawnError) throw spawnError;
      // Another task may bind between the probe and Next startup. Retry only that case.
      if (!task.port && /EADDRINUSE/.test(output)) continue;
      fail("Next.js did not become ready. Inspect the preview tab.");
    }
    fail(task.port ? `Port ${task.port} is already in use` : "No preview port was available in 4100–4999");
  } catch (error) {
    signalChild("SIGTERM");
    record({ status: "failed", message: error.message });
    throw error;
  } finally {
    if (stopping) record({ status: "stopped" });
  }
}

main().catch(report);
