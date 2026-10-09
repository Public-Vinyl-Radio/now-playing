import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function fail(message) { throw new Error(message); }

export function requireHerdr() {
  if (process.env.HERDR_ENV !== "1") fail("Run this from a Herdr pane. Launch 'just herdr' from a normal terminal first.");
}

export function run(command, args, cwd = process.cwd()) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function api(args) {
  const result = JSON.parse(run("herdr", args));
  if (!result.result) fail("Herdr returned no result. Inspect its output before retrying.");
  return result.result;
}

export function repoRoot() { return realpathSync(run("git", ["rev-parse", "--show-toplevel"])); }

export function mainWorktree(root) {
  const first = run("git", ["worktree", "list", "--porcelain", "-z"], root).split("\0")[0];
  if (!first.startsWith("worktree ")) fail("Could not identify the main checkout.");
  return realpathSync(first.slice(9));
}

export function stateDirectory(root) { return join(root, ".herdr-task"); }

export function readState(root, name = "task") {
  return JSON.parse(readFileSync(join(stateDirectory(root), `${name}.json`), "utf8"));
}

export function writeState(root, name, value) {
  const directory = stateDirectory(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${name}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, file);
}

export function shellQuote(value) { return "'" + value.replaceAll("'", "'\\''") + "'"; }

export const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function installDependencies(root) {
  console.log("Installing isolated worktree dependencies ...");
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["ci"], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`npm ci exited with ${code}`)));
  });
}

export function report(error) {
  // CLI errors contain only the invoked operation, not environment values.
  if (error.stderr) console.error(String(error.stderr).trim());
  console.error(error.message);
  process.exitCode = 1;
}
