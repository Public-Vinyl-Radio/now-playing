import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api, delay, fail, mainWorktree, readState, repoRoot, report, requireHerdr, run } from "./lib.mjs";

const HELP = `Usage: just herdr-done [--dry-run] [--force]

Run inside this task's Herdr workspace. Stop its preview and remove its worktree
workspace. Keep the local branch. Refuse the main checkout, dirty work, and
unpublished task commits unless --force explicitly permits discarding them.
--dry-run prints the plan without changing panes, processes, or worktrees.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  if (args.some(arg => !["--force", "--dry-run"].includes(arg))) fail(HELP);
  const force = args.includes("--force"), dry = args.includes("--dry-run");
  requireHerdr();
  const root = repoRoot();
  if (root === mainWorktree(root)) fail("The main checkout cannot be removed by herdr-done");
  const task = readState(root);
  const current = api(["pane", "current", "--current"]);
  if (task.worktreePath !== root || current.pane?.workspace_id !== task.workspaceId) fail("This checkout does not belong to the calling task workspace");
  if (!force) {
    if (run("git", ["status", "--porcelain"], root)) fail("Uncommitted changes remain. Commit or stash them before cleanup, or explicitly use --force.");
    // Exclude the task's original base as well as remotes: a locally committed
    // helper baseline should not count as unpublished work performed by this task.
    const count = run("git", ["rev-list", "HEAD", "--not", "--remotes", task.baseCommit, "--count"], root);
    if (count !== "0") fail(`${count} task commit(s) are not published. Push them before cleanup, or explicitly use --force.`);
  }
  let preview;
  try { preview = readState(root, "preview"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  let stopPreview = false;
  if (preview && preview.status !== "stopped") {
    if (preview.taskId !== task.id || !Number.isInteger(preview.pid)) fail("Preview ownership metadata is invalid");
    try { process.kill(preview.pid, 0); stopPreview = true; }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    if (stopPreview) {
      const command = run("ps", ["-p", String(preview.pid), "-o", "command="]);
      if (!command.includes(join(root, "scripts/worktree/preview.mjs")) || !command.includes(task.id)) fail("The recorded preview PID belongs to another process; inspect the preview before cleanup");
    }
  }
  console.log(`${dry ? "Would stop" : "Stopping"} this task's preview and remove workspace ${task.workspaceId}.\nWorktree: ${root}\nThe branch is retained.`);
  if (dry) return;
  if (stopPreview) {
    process.kill(preview.pid, "SIGTERM");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try { process.kill(preview.pid, 0); } catch (error) { if (error.code === "ESRCH") { stopPreview = false; break; } throw error; }
      await delay(200);
    }
    if (stopPreview) fail("The preview did not stop. Inspect its tab before removing the task.");
  }
  // Workspace removal closes the calling pane, so run that last action detached.
  const logPath = join(mkdtempSync(join(tmpdir(), "pvr-herdr-done-")), "cleanup.log");
  const log = openSync(logPath, "w", 0o600);
  const removal = spawn("herdr", ["worktree", "remove", "--workspace", task.workspaceId, ...(force ? ["--force"] : [])], {
    cwd: mainWorktree(root), detached: true, stdio: ["ignore", log, log],
  });
  closeSync(log);
  removal.on("error", report);
  removal.unref();
  console.log(`Workspace removal runs detached. Log: ${logPath}`);
}

main().catch(report);
