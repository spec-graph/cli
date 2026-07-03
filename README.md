# @spec-graph/cli

Human-facing command-line interface to spec-graph — the declaration engine. Dispatch manifest generator + gate evaluator.

## Installation

```bash
# From this monorepo (local development)
npm install
```

## Usage

```bash
npx tsx src/index.ts <command> [options]
```

## Commands

### `plan <intent> [--confirm] [--fallback] [--json]`

Create a session with a plan. LLM mode by default (generates planning manifest for external coordinator). Use `--fallback` for offline keyword matching.

```bash
spec-graph plan "Add JWT authentication"
spec-graph plan "Add JWT authentication" --fallback --confirm
spec-graph plan "Add JWT authentication" --json
```

### `dispatch --session <id> [--json]`

Generate dispatch manifest. The manifest tells the external coordinator what to do: which agent, what prompt, what output, what file scope.

```bash
spec-graph dispatch --session add-jwt-authentication --json
```

### `submit --result <json> [--session <id>] [--result-file <path>]`

Submit the agent's result for gate evaluation:
- If all exit criteria pass → state advances to next stage
- If any fail → returns diagnosis, allows retry

```bash
spec-graph submit --result '{"artifacts": [{"path": "...", "content": "..."}]}'
spec-graph submit --result-file ./result.json
```

### `status [--json] [--session <id>]`

Show current session state: stage, progress, blockers, recent diagnosis.

```bash
spec-graph status
spec-graph status --json
```

### `validate [--session <id>]`

Validate the current session state.

### `intervene <action> [--session <id>]`

Manual intervention in the workflow.

Available actions:
- `force-advance` — skip gate, advance to next stage
- `rollback` — rollback to previous stage
- `resume` — resume a paused session
- `modify-plan` — update the plan

```bash
spec-graph intervene force-advance
spec-graph intervene rollback
```

### `diagnose [--json] [--session <id>]`

Show the most recent gate failure diagnosis with failed criteria and suggested fixes.

```bash
spec-graph diagnose
spec-graph diagnose --json
```

## Architecture

spec-graph CLI provides atomic commands. The auto-loop is driven by the external coordinator (Claude Code via `/spec-graph-auto` skill), not by the CLI. See [brain-not-hands principle](../../README.md#philosophy).

## Agent Integration

AI agents use the CLI via shell commands:

```bash
# Start a session
spec-graph plan "Add JWT auth" --fallback --confirm

# Get dispatch manifest
spec-graph dispatch --session add-jwt-auth --json

# ... coordinator dispatches sub-agent, produces artifact ...

# Submit result for gate evaluation
spec-graph submit --session add-jwt-auth --result '{"artifacts": [...]}'

# Check progress
spec-graph status --json
```

See `packages/skills/` for Claude Code skill files that orchestrate these commands.
