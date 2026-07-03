/**
 * hook dispatch command — reads PostToolUse hook context from stdin,
 * parses the dispatch manifest, builds a system-reminder, and outputs
 * hookSpecificOutput JSON.
 *
 * This is the logic that was previously in dispatch-watcher.mjs.
 * Moving it into a CLI command makes it testable, type-safe, and
 * decouples hook configuration from hook logic.
 */
import { Command } from 'commander';
import * as fs from 'node:fs';

interface HookContext {
  session_id?: string;
  tool_name?: string;
  tool_input?: { command?: string };
  tool_response?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
}

interface DispatchAction {
  index: number;
  type: string;
  id: string;
  description?: string;
  requires_sub_agent?: boolean;
  agent_id?: string;
  agent_prompt_ref?: string;
  model_tier?: string;
  prompt?: string;
  file_scope?: { read: string[]; write: string[]; forbid: string[] };
  output_spec?: { path: string; template?: string; format?: string };
  verification?: Record<string, string>;
  next_step?: string;
  check_command?: string;
  recommended_command?: string;
  input_artifacts?: Array<{
    id: string;
    kind: string;
    path: string;
    content?: string;
  }>;
  parallel_group?: number;
  meeting?: unknown;
}

interface DispatchManifest {
  done: boolean;
  gate_passed?: boolean;
  current_stage?: string;
  next_stage?: string;
  missing_artifacts?: string[];
  failed_checks?: string[];
  missing_traces?: string[];
  forbidden_violations?: string[];
  actions?: DispatchAction[];
  meeting?: {
    available?: boolean;
    recommended?: boolean;
    reason?: string;
    template?: {
      id?: string;
      purpose?: string;
      participants?: Array<{
        agent_id?: string;
        role?: string;
        perspective?: string;
      }>;
      min_rounds?: number;
      max_rounds?: number;
    };
  };
  specs?: {
    available?: boolean;
    recommended?: boolean;
    reason?: string;
  };
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function buildReminder(manifest: DispatchManifest): string {
  const actions = manifest.actions || [];

  const groups = new Map<number, DispatchAction[]>();
  for (const action of actions) {
    const g = action.parallel_group ?? -1;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(action);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);

  const firstAction = actions[0];
  const agentId = firstAction.agent_id || 'unknown';
  const requiresSubAgent = firstAction.requires_sub_agent !== false;

  const gateFailures =
    !manifest.gate_passed && !manifest.done
      ? `\n   Gate failures: ${
          [
            manifest.missing_artifacts?.length && `missing_artifacts=${manifest.missing_artifacts.length}`,
            manifest.failed_checks?.length && `failed_checks=${manifest.failed_checks.length}`,
          ]
            .filter(Boolean)
            .join(', ') || 'unspecified'
        }`
      : '';

  let executionBlock: string;
  let summaryLine: string;

  if (sortedGroups.length === 1 && sortedGroups[0][1].length === 1) {
    const action = actions[0];
    const hasMeeting = manifest.meeting?.available
      ? `\n   Meeting available: ${manifest.meeting.template?.id || ''}${
          manifest.meeting.recommended
            ? ' (RECOMMENDED: ' + manifest.meeting.reason + ')'
            : ''
        }\n   Init meeting: spec-graph meeting init ${manifest.meeting.template?.id || 'meeting'}`
      : '';
    const hasSpecs = manifest.specs?.available
      ? `\n   Specs stage: ${manifest.specs.recommended ? 'RECOMMENDED' : 'available'}${
          manifest.specs.recommended ? ' — ' + manifest.specs.reason : ''
        }`
      : '';
    const inputArtifactsSummary =
      action.input_artifacts && action.input_artifacts.length > 0
        ? `\n   Input artifacts: ${action.input_artifacts.length} (see manifest actions[0].input_artifacts for paths)`
        : '';

    if (requiresSubAgent) {
      executionBlock = `EXECUTION (sub-agent):
1. Load system prompt from ${action.agent_prompt_ref || '(none)'}
2. Use the FULL prompt from actions[0].prompt as the sub-agent prompt (already includes system prompt + task context + input artifacts)
3. Dispatch via Agent tool: description="${action.id} stage", model="${action.model_tier || 'standard'}", prompt=actions[0].prompt
4. Wait for status-report block (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
5. Run next_step: ${action.next_step || 'spec-graph dispatch --json'}
6. Loop back to dispatch`;
    } else if (action.type === 'verify_trace') {
      executionBlock = `EXECUTION (deterministic — NO sub-agent):
1. Trace '${action.id}' is required by gate but missing.
2. Read actions[0].trace_query for from_kind/to_kind/via/cardinality.
3. Either create the trace manually: spec-graph trace add --from <from_kind> --to <to_kind> --via <via>
   OR complete dependent artifacts (auto-wires traces).
4. Loop back to: spec-graph dispatch --json`;
    } else {
      executionBlock = `EXECUTION (deterministic — NO sub-agent):
1. Run check_command directly via Bash: ${action.check_command || action.recommended_command || (action as any).command}
2. Loop back to: spec-graph dispatch --json`;
    }

    summaryLine = `Action: ${action.type} — ${action.id}
  Agent: ${agentId}
  Model tier: ${action.model_tier || 'standard'}${hasSpecs}${hasMeeting}${inputArtifactsSummary}${gateFailures}
  Requires sub-agent: ${requiresSubAgent ? 'YES — dispatch via Agent tool' : 'NO — run check_command directly via Bash'}`;
  } else {
    const waveDescriptions: string[] = [];
    for (const [group, groupActions] of sortedGroups) {
      if (groupActions.length === 1) {
        waveDescriptions.push(`  Wave ${group}: ${groupActions[0].id} (single action)`);
      } else {
        const agentList = groupActions
          .map((a) => `${a.id}(${a.agent_id || 'self'})`)
          .join(', ');
        waveDescriptions.push(
          `  Wave ${group}: PARALLEL dispatch ${groupActions.length} sub-agents: ${agentList}`,
        );
      }
    }

    executionBlock = `EXECUTION (parallel waves):
${sortedGroups
  .map(([group, groupActions], idx) => {
    if (groupActions.length === 1) {
      const a = groupActions[0];
      const isLast = idx === sortedGroups.length - 1;
      return `Wave ${group} (sequential):
  Dispatch sub-agent: description="${a.id}", model="${a.model_tier || 'standard'}", prompt=actions[${a.index - 1}].prompt
  Wait for completion, then ${isLast ? 'run: ' + a.next_step : 'continue to next wave'}`;
    } else {
      const isLast = idx === sortedGroups.length - 1;
      return `Wave ${group} (PARALLEL — dispatch ALL sub-agents simultaneously):
${groupActions
  .map(
    (a) =>
      `  - Agent("${a.id}", model="${a.model_tier || 'standard'}", prompt=actions[${a.index - 1}].prompt)`,
  )
  .join('\n')}
  Wait for ALL to complete, then ${
    isLast ? 'run next_step for each' : 'continue to next wave'
  }`;
    }
  })
  .join('\n')}
Loop back to: spec-graph dispatch --json`;

    summaryLine = `Actions: ${actions.length} across ${sortedGroups.length} wave(s)${gateFailures}
${waveDescriptions.join('\n')}`;
  }

  return `<system-reminder>
spec-graph dispatch output detected. The FULL manifest is already in your context from the Bash result above — use action fields directly. Per packs/foundation.pack/agents/coordinator-protocol.md, execute NOW (pre-approved, no user confirmation needed).

${summaryLine}

${executionBlock}

⚠️ AUTO-LOOP PROTOCOL: After completing all actions, IMMEDIATELY re-run 'spec-graph dispatch --json' to get the next action. Do NOT wait for user input. Continue this loop until manifest.done === true, gate is blocked with no auto-fix, or sub-agent returns BLOCKED.

Stop when:
  - manifest.done === true (workflow complete)
  - gate_blocked AND you cannot fix it (escalate to user)
  - sub-agent returns BLOCKED (escalate to user)

For unclear issues, self-initiate a meeting: spec-graph meeting init <id> --purpose <text> --participants <list>
</system-reminder>`;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function register(program: Command): void {
  const hookCmd = new Command('hook')
    .description('Hook integration commands');

  hookCmd
    .command('dispatch')
    .description('Process PostToolUse hook context from stdin, output system-reminder')
    .action(() => {
      const result = processHookInput(readStdin());
      if (result) process.stdout.write(result);
      process.exit(0);
    });

  program.addCommand(hookCmd);
}

// ---------------------------------------------------------------------------
// Core logic — exported for testing
// ---------------------------------------------------------------------------

/**
 * Process hook context JSON string, return hookSpecificOutput JSON string or ''.
 */
export function processHookInput(input: string): string {
  if (!input.trim()) return '';

  let ctx: HookContext;
  try {
    ctx = JSON.parse(input);
  } catch {
    return '';
  }

  if (ctx.tool_name !== 'Bash') return '';

  const command = ctx.tool_input?.command || '';
  if (!command.includes('spec-graph dispatch')) return '';

  const stdout = ctx.tool_response?.stdout || '';

  let manifest: DispatchManifest;
  try {
    manifest = JSON.parse(stdout);
  } catch {
    return '';
  }

  if (manifest.done) return '';

  const actions = manifest.actions || [];
  if (actions.length === 0) return '';

  const reminder = buildReminder(manifest);

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: reminder,
    },
  });
}
