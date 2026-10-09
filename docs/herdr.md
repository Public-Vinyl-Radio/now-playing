# Herdr worktree tasks

Requires Node.js 22.18+, npm, Git, [just](https://just.systems), and
[Herdr](https://herdr.dev). Install `codex` or `claude` for agent prompts;
GitHub issue prompts also require an authenticated `gh` CLI.

The helpers must be committed in the base revision before creating a task.
New worktrees contain committed files, not local edits to the main checkout.

## Launch the session

From a normal terminal:

```sh
cd ~/Projects/now-playing
just herdr
```

The session defaults to `now-playing`. Override it with `HERDR_SESSION` if
needed. From an existing Herdr pane, use `just herdr-task` directly.

## Start a task

```sh
just herdr-task design/typography --agent codex --issue 1
```

This creates a worktree based on `main`, opens a background workspace, runs
`npm ci` there, starts a mock Next.js preview in a separate **Preview** tab,
and submits the issue prompt to Codex in the original task pane. The preview
must become ready before the agent starts. `--focus` switches to the workspace.

Use a custom prompt or a file instead:

```sh
just herdr-task docs/preview --prompt "Improve the documentation for the iPad preview workflow."
just herdr-task design/on-air --agent claude --prompt-file /path/to/prompt.md
```

`--prompt`, `--prompt-file`, and `--issue` are mutually exclusive. Argument
boundaries, spaces, quotes, and multiline prompt text are preserved. Codex is
the default agent. Without a prompt, the original pane stays a normal shell.

Issue prompts ask the agent to read the issue and follow `AGENTS.md`. Unresolved
design choices should be discussed before implementing them. Issue prompts do
not automatically authorize a commit, push, PR, or production deployment.

Options:

| Option | Purpose |
| --- | --- |
| `--base REF` | Start from another committed revision |
| `--agent codex\|claude` | Select the agent when supplying a prompt |
| `--port 4201` | Request a particular preview port |
| `--no-bootstrap` | Skip dependency installation |
| `--no-preview` | Create a task without a preview, useful for documentation |
| `--focus` | Switch focus to the new workspace |

For a documentation-only task:

```sh
just herdr-task docs/readme --no-bootstrap --no-preview --prompt "Improve README setup instructions."
```

If setup fails, the task remains available for inspection. Read the printed
workspace ID and its preview logs before retrying; creating the same branch
again will not resume a partially initialized task.

## Preview isolation

Each worktree has its own `node_modules`, `.next`, and development server.
The default preview selects an available port in **4100–4999**, retrying a
startup port collision. The helper prints localhost and network URLs for
Safari on the iPad. The Mac must be reachable over your LAN or tailnet and
its firewall must allow the chosen port.

Previews use `PVR_DATA_MODE=mock`. The helper removes an inherited `HA_TOKEN`
from the preview process environment and does not copy local `.env` files
into the worktree. This keeps visual tasks independent of the HA connection.
Live integration development can be configured explicitly using the existing
server-side 1Password instructions in the README.

The preview helper supplies the Mac's current IPv4 addresses through
`PVR_DEV_ORIGINS` so Next.js permits development asset requests from the iPad.
This affects development origins only. It does not change the production
authentication or proxy behavior.

Task and preview ownership metadata is stored in the ignored `.herdr-task`
directory. The preview runs in its own Herdr tab, with its Next.js subprocesses
in a dedicated process group so stopping the task also stops its server.

## Finish a task

From a pane inside that worktree's workspace:

```sh
just herdr-done --dry-run
just herdr-done
```

Cleanup refuses the main checkout, a different task workspace, uncommitted
files, or task commits that are not reachable from any fetched remote ref.
Commit and push completed work first. If merging a PR on another machine,
fetch the remote before cleanup. The task's original base revision is excluded
from this check, so locally committed helper setup is not counted as task work.

`--force` explicitly allows removing a dirty checkout or a task with unpublished
commits. The local branch is retained. The helper checks preview ownership,
stops that preview, then removes the worktree workspace through Herdr.
Workspace removal runs detached because it closes the calling pane; a cleanup
log path is printed before removal.

Next.js may regenerate tracked `next-env.d.ts` during development. Review any
such changes along with your task diff before committing or cleaning up.
