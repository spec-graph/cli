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

### `plan <intent> [--confirm] [--json]`

Create a session with a plan. The plan decomposes the intent into capabilities
with dependency ordering. Use `--confirm` to auto-confirm the plan.

```bash
spec-graph plan "Add JWT authentication"
spec-graph plan "Add JWT authentication" --confirm
spec-graph plan "Add JWT authentication" --json
```

### `auto <intent> [--adapter claude-code] [--max-retries 3]`

Start the full automatic workflow. Creates a session, confirms the plan,
then loops: generate prompt → invoke agent → submit result → evaluate gate
→ advance state.

```bash
spec-graph auto "Add JWT authentication"
spec-graph auto "Add JWT authentication" --adapter claude-code --max-retries 2
```

### `status [--json] [--session <id>]`

Show current session state: stage, progress, blockers, recent diagnosis.

```bash
spec-graph status
spec-graph status --json
spec-graph status --session add-jwt-authentication
```

### `next-prompt [--session <id>]`

Get the next XML prompt for the external agent. The prompt is layered with
MUST/SHOULD/MAY priority levels and includes methodology from the knowledge-base.

```bash
spec-graph next-prompt
```

### `advance [--result <json>] [--session <id>]`

Submit the agent's result. Evaluates the current stage's exit criteria:
- If all pass → advance to next stage
- If any fail → produce diagnosis, allow retry

```bash
spec-graph advance --result '{"artifacts": [{"path": "...", "content": "..."}]}'
```

### `validate [--session <id>]`

Validate the current session state.

### `intervene <action> [--session <id>]`

Manual intervention in the workflow.

Available actions:
- `force-advance` — force advance to next stage
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

## Three API Surfaces

The CLI exposes three modes of operation:

1. **Auto** — single command, walks away, comes back when done
2. **Stateless** — verb commands (`next-prompt`, `advance`, `status`) for external orchestration
3. **Hook** — integration with agent hook mechanisms (future)

## Agent Integration

AI agents can use the CLI via shell commands:

```bash
# Start a session
spec-graph plan "Add JWT auth" --confirm --json

# Get prompt
spec-graph next-prompt

# ... agent does work ...

# Submit result
spec-graph advance --result '{"artifacts": [...]}'

# Check progress
spec-graph status --json
```

See `packages/skills/` for Claude Code skill files that orchestrate these commands.
