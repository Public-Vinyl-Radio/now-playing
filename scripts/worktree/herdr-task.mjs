import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { api, delay, fail, installDependencies, readState, repoRoot, report, requireHerdr, run, shellQuote, writeState } from "./lib.mjs";

const HELP = `Usage: just herdr-task <branch> [options]

  --base REF          Base commit or branch (default: main)
  --agent KIND        codex (default) or claude; started only with a prompt
  --prompt TEXT       Give the agent a prompt, preserving spaces and newlines
  --prompt-file PATH  Read the prompt from a file
  --issue N           Read this repo's GitHub issue and work on its agreed scope
  --no-bootstrap      Skip npm ci
  --no-preview        Skip the isolated mock Next.js preview
  --port N            Request a particular preview port (automatic by default)
  --focus             Focus the new workspace (background by default)

Prompt sources are mutually exclusive. Run inside Herdr. Helpers must exist
in the committed base ref. A failed setup leaves the workspace for inspection.
`;

async function main() {
  let branch, base = "main", agent = "codex", prompt, promptFile, issue, port;
  let bootstrap = true, preview = true, focus = false;
  const args = process.argv.slice(2);
  const value = flag => {
    const result = args.shift();
    if (!result) fail(`${flag} requires a value`);
    return result;
  };
  while (args.length) {
    const arg = args.shift();
    switch (arg) {
      case "-h": case "--help": console.log(HELP); return;
      case "--base": base = value(arg); break;
      case "--agent": agent = value(arg); break;
      case "--prompt": prompt = value(arg); break;
      case "--prompt-file": promptFile = value(arg); break;
      case "--issue": issue = value(arg); break;
      case "--port": port = Number(value(arg)); break;
      case "--no-bootstrap": bootstrap = false; break;
      case "--no-preview": preview = false; break;
      case "--focus": focus = true; break;
      case "--": break;
      default:
        if (arg.startsWith("-") || branch) fail(`Unexpected argument: ${arg}`);
        branch = arg;
    }
  }
  if (!branch) fail(HELP);
  if (!["codex", "claude"].includes(agent)) fail("--agent must be codex or claude");
  if ([prompt, promptFile, issue].filter(value => value !== undefined).length > 1) fail("Choose only one prompt source");
  if (issue !== undefined && !/^[1-9][0-9]*$/.test(issue)) fail("--issue needs a positive issue number");
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) fail("--port must be between 1024 and 65535");
  if (promptFile) prompt = readFileSync(promptFile, "utf8");
  if (issue) prompt = `Read GitHub issue #${issue} in this repository with gh issue view ${issue}. Follow AGENTS.md and the local Next.js documentation. Work only on this issue's agreed requirements. If design choices remain unresolved, ask the owner before implementing them. Use the isolated mock preview for visual work. Summarize the changes and any remaining decisions for review.`;
  if (prompt !== undefined && !prompt.trim()) fail("The prompt is empty");
  requireHerdr();
  const root = repoRoot();
  run("git", ["check-ref-format", "--branch", branch], root);
  const baseCommit = run("git", ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`], root);
  for (const file of ["scripts/worktree/lib.mjs", "scripts/worktree/preview.mjs", "justfile"]) {
    try { run("git", ["cat-file", "-e", `${baseCommit}:${file}`], root); }
    catch { fail(`Commit the Herdr helpers first, or select a --base that includes them. Missing: ${file}`); }
  }
  if (prompt) run(agent, ["--version"]);
  // Check the CLI before creating any workspace.
  run("herdr", ["worktree"]);
  const created = api(["worktree", "create", "--cwd", root, "--branch", branch, "--base", baseCommit, "--label", branch, focus ? "--focus" : "--no-focus"]);
  const path = created.worktree?.path;
  const workspaceId = created.workspace?.workspace_id ?? created.root_pane?.workspace_id;
  const agentPaneId = created.root_pane?.pane_id;
  if (!path || !workspaceId || !agentPaneId) fail("Herdr created a task but returned incomplete identifiers. Inspect the workspace before retrying.");
  const worktree = realpathSync(path);
  const task = { version: 1, id: randomUUID(), branch, baseCommit, worktreePath: worktree, workspaceId, agentPaneId };
  writeState(worktree, "task", task);
  console.log(`Worktree: ${worktree}\nWorkspace: ${workspaceId}`);
  try {
    if (bootstrap) await installDependencies(worktree);
    if (preview) {
      if (!existsSync(join(worktree, "node_modules/next/dist/bin/next"))) fail("Preview requires dependencies. Run just bootstrap in the task, or omit --no-bootstrap.");
      const tab = api(["tab", "create", "--workspace", workspaceId, "--cwd", worktree, "--label", "Preview", "--no-focus"]);
      task.previewPaneId = tab.root_pane?.pane_id;
      if (!task.previewPaneId) fail("Preview tab returned no pane ID");
      task.port = port;
      writeState(worktree, "task", task);
      api(["pane", "run", task.previewPaneId, `node ${shellQuote(join(worktree, "scripts/worktree/preview.mjs"))} --task-id ${shellQuote(task.id)}`]);
      const deadline = Date.now() + 120_000;
      let ready;
      while (Date.now() < deadline) {
        try {
          const state = readState(worktree, "preview");
          if (state.taskId === task.id && state.status === "failed") fail(state.message ?? "Preview failed; inspect its tab");
          if (state.taskId === task.id && state.status === "ready") { ready = state; break; }
        } catch (error) { if (error.code !== "ENOENT") throw error; }
        await delay(500);
      }
      if (!ready) fail("Preview did not become ready within two minutes. Inspect its tab before retrying.");
      console.log(`Mock preview: ${ready.url}`);
      for (const url of ready.networkUrls ?? []) console.log(`Network preview: ${url}`);
    }
    if (prompt) {
      const suffix = createHash("sha256").update(worktree).digest("hex").slice(0, 6);
      const slug = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 20);
      const name = `pvr-${slug}-${suffix}`;
      api(["agent", "start", name, "--kind", agent, "--pane", agentPaneId]);
      task.agentName = name;
      writeState(worktree, "task", task);
      api(["agent", "prompt", name, "--", prompt]);
      console.log(`Submitted the prompt to ${name} (${agent}).`);
    } else console.log("The task pane is ready for manual work.");
  } catch (error) {
    console.error(`Task retained for inspection: ${workspaceId} (${worktree}).`);
    throw error;
  }
}

main().catch(report);
