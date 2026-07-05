# @spec-graph/cli

Human-facing command-line interface to spec-graph v3.1 — the declaration engine. Dispatch manifest generator + gate evaluator + task lifecycle manager.

## Installation

```bash
npm install -g @spec-graph/cli
```

## Quick Start

```bash
# Initialize project
spec-graph init

# Plan work
spec-graph plan "Build user auth" --confirm

# Continue (auto-selects latest running session)
spec-graph run

# Check status
spec-graph status
```

## Commands

### Workflow

| Command | Description |
|---------|-------------|
| `plan <intent> [--confirm] [--fallback] [--json] [--abbrev <s>]` | Create a session with a plan |
| `dispatch --session <id> --json` | Generate dispatch manifest with task lifecycle steps |
| `submit --result <json> [--session <id>]` | Submit agent result for gate evaluation |
| `status [--json] [--session <id>]` | Show session state, progress, blockers |
| `validate [--session <id>]` | Validate current session state |
| `intervene <action> [--session <id>]` | force-advance / rollback / resume / modify-plan |
| `diagnose [--json] [--session <id>]` | Show most recent gate failure diagnosis |

### Task Management (v3.1)

| Command | Description |
|---------|-------------|
| `task list [--session <id>]` | List tasks with story status (✓/▶/◎/→/○) |
| `task start <id> [--session <id>]` | Mark task as running (requires complete story) |
| `task review <id> [--session <id>]` | Review task — runs quality checks |
| `task complete <id> [--session <id>]` | Complete task (requires review pass) |
| `task story <id> [--session <id>]` | Generate or view story document |
| `task stories [--session <id>]` | Check all stories are complete (no placeholders) |

Task lifecycle: `pending → running → reviewing → completed`

### Session Management (v3.1)

| Command | Description |
|---------|-------------|
| `run [--session <id>] [--auto-next]` | Auto-select session, show resume info |
| `sessions list` | List all sessions from CSV index |
| `sessions info --session <id>` | Detailed session info |
| `sessions delete --session <id>` | Delete session (directory + CSV) |
| `sessions migrate` | Migrate legacy long-named directories |
| `sessions doctor [--fix]` | Verify CSV-directory consistency |
| `sessions archive [--session <id>]` | Archive completed session |

### Setup

| Command | Description |
|---------|-------------|
| `init [--force] [--skip-hook] [--skip-permissions]` | Initialize .spec-graph/ + register hook + auto-allow permissions |
| `compose` | Compose graph.yaml from installed packs |
| `install` | Install skills to .claude/skills/ |

## Agent Integration

AI agents use the CLI via shell commands:

```bash
# Start a session
spec-graph plan "Add JWT auth" --confirm

# Continue
spec-graph run

# Generate story
spec-graph task story user-model

# Task lifecycle
spec-graph task start user-model
# ... dispatch sub-agent, produce artifact ...
spec-graph task review user-model
spec-graph task complete user-model

# Dispatch loop (with hook automation)
spec-graph dispatch --session <id> --json
spec-graph submit --session <id> --result '{"artifacts": [...]}'
```

The PostToolUse hook auto-chains: `task start` → dispatch → sub-agent → `task review` → `task complete` → submit → loop.

## Architecture

spec-graph CLI provides atomic commands. The auto-loop is driven by the external coordinator (Claude Code via skills), not by the CLI. See the [brain-not-hands principle](https://github.com/spec-graph/monorepo#philosophy).

See `packages/skills/` for Claude Code skill files that orchestrate these commands.
