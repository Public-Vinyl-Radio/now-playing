set shell := ["zsh", "-cu"]

default:
    @just --list

# Install this checkout's dependencies.
bootstrap:
    npm ci

# Launch or attach to this repo's Herdr session from a normal terminal.
herdr:
    @command -v herdr >/dev/null 2>&1 || { echo "herdr is not installed: https://herdr.dev"; exit 1; }
    @if [[ "${HERDR_ENV:-}" == 1 ]]; then echo "Already inside Herdr; use 'just herdr-task <branch>' for a new task."; exit 1; fi
    herdr --session "${HERDR_SESSION:-now-playing}"

# Create an isolated worktree, preview, and optional agent prompt.
[positional-arguments]
herdr-task branch *args:
    node ./scripts/worktree/herdr-task.mjs "$1" "${@:2}"

# Stop this task's preview and remove its worktree workspace.
[positional-arguments]
herdr-done *args:
    node ./scripts/worktree/herdr-done.mjs "$@"
