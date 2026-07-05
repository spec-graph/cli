/**
 * hook dispatch command — reads PostToolUse hook context from stdin,
 * parses the routing dispatch manifest, builds a system-reminder, and outputs
 * hookSpecificOutput JSON.
 *
 * V2: dispatch outputs routing manifest (paths, not prompt content).
 * The sub-agent reads its role, skills, and upstream from the manifest paths.
 */
import { Command } from 'commander';
import * as fs from 'node:fs';
import type { DispatchAction, DispatchManifest } from '@spec-graph/core';

interface HookContext {
  session_id?: string;
  tool_name?: string;
  tool_input?: { command?: string };
  tool_response?: { stdout?: string; stderr?: string; exitCode?: number };
}

// Aliases for backward compat with hook's internal naming
type RoutingAction = DispatchAction;
type RoutingManifest = DispatchManifest;

function readStdin(): string {
  try { return fs.readFileSync(0, 'utf-8'); } catch { return ''; }
}

function buildReminder(manifest: RoutingManifest): string {
  const actions = manifest.actions || [];
  const groups = new Map<number, RoutingAction[]>();
  for (const a of actions) {
    const g = a.parallel_group ?? -1;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(a);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);

  let executionBlock: string;
  let summaryLine: string;

  if (sortedGroups.length === 1 && sortedGroups[0][1].length === 1) {
    const a = actions[0];
    summaryLine = `Stage: ${manifest.stage} | Action: ${a.id} | Agent: ${a.agent.split('/').pop()?.replace('-agent.md', '') || 'unknown'}`;
    executionBlock = `1. Dispatch via Agent tool with the following prompt:

\`\`\`
You are executing spec-graph's ${manifest.stage} stage.

manifest:
  role_file: ${a.agent}
  skills_dirs: [${a.skills.join(', ')}]
  context_files: [${a.upstream.join(', ')}]
  output_path: ${a.output}
  intent: ${manifest.intent}

CRITICAL STEPS (execute in order, do not skip):
  1. READ role_file — this defines your role
  2. READ skills_dirs — read instruction.md in each for methodology
  3. READ context_files — understand previous stage outputs
  4. Execute the task — write deliverable to output_path
  5. Run checks — validate your work
  6. End with status-report:
     \`\`\`status-report
     {"status":"DONE","artifacts_produced":["${a.output}"],"concerns":[],"missing_context":null,"blocker":null,"summary":"..."}
     \`\`\`

Do NOT skip any step. If any file is unreadable, report BLOCKED immediately.
\`\`\`

2. Sub-agent writes artifact to ${a.output}, returns status-report
3. Parse status-report:
   - DONE → read artifact from disk, build result JSON, run submit
   - DONE_WITH_CONCERNS → submit with concerns noted
   - NEEDS_CONTEXT → report to user
   - BLOCKED → escalate to user
4. Build result: {"artifacts": [{"path": "${a.output}", "content": "<read from disk>"}]}
5. Run: spec-graph submit --session ${manifest.session_id} --result '{"artifacts":[{"path":"${a.output}","content":"<read from disk>"}]}'`;
  } else {
    const waveDescriptions = sortedGroups.map(([g, gas]) =>
      gas.length === 1 ? `Wave ${g}: ${gas[0].id}` : `Wave ${g}: PARALLEL — ${gas.length} sub-agents (${gas.map(a => a.id).join(', ')})`);
    summaryLine = `Stage: ${manifest.stage} | ${actions.length} actions across ${sortedGroups.length} wave(s)`;
    executionBlock = `PARALLEL dispatch:
${waveDescriptions.join('\n')}

For EACH sub-agent, dispatch via Agent tool with prompt containing:
  role_file: <action.agent>
  skills_dirs: <action.skills>
  context_files: <action.upstream>
  output_path: <action.output>

After ALL sub-agents complete:
1. Parse each status-report
2. Read each artifact from disk
3. Build combined result JSON
4. spec-graph submit --session ${manifest.session_id} --result '{"artifacts":[...]}'`;
  }

  return `<system-reminder>
spec-graph dispatch output detected. Execute NOW.

${summaryLine}

${executionBlock}

## Auto-loop

After submit → IMMEDIATELY re-run: spec-graph dispatch --session ${manifest.session_id} --json
Stop when manifest.done === true or sub-agent returns BLOCKED.
</system-reminder>`;
}

export function register(program: Command): void {
  const hookCmd = new Command('hook').description('Hook integration commands');
  hookCmd.command('dispatch').description('Process hook context from stdin').action(() => {
    const result = processHookInput(readStdin());
    if (result) process.stdout.write(result);
    process.exit(0);
  });
  program.addCommand(hookCmd);
}

export function processHookInput(input: string): string {
  if (!input.trim()) return '';
  let ctx: HookContext;
  try { ctx = JSON.parse(input); } catch { return ''; }
  if (ctx.tool_name !== 'Bash') return '';
  const command = ctx.tool_input?.command || '';

  // Handle submit → remind agent to re-run dispatch
  if (command.includes('spec-graph submit')) {
    const stdout = ctx.tool_response?.stdout || '';
    try {
      const result = JSON.parse(stdout);
      if (result.advanced && !result.done) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
Gate PASSED → advanced to "${result.nextStage}". IMMEDIATELY re-run:
  spec-graph dispatch --session <id> --json
</system-reminder>` }});
      }
      if (result.done) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
spec-graph workflow COMPLETE! state = "completed". readyForArchive = true.
</system-reminder>` }});
      }
      if (!result.advanced && result.diagnosis) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
Gate FAILED. Diagnosis: ${JSON.stringify(result.diagnosis)}
1. Read diagnosis → fix artifact → re-submit:
   spec-graph submit --session <id> --result-file <path>
</system-reminder>` }});
      }
    } catch { return ''; }
    return '';
  }

  // Handle dispatch → parse routing manifest + build reminder
  if (!command.includes('spec-graph dispatch')) return '';
  const stdout = ctx.tool_response?.stdout || '';
  let manifest: RoutingManifest;
  try { manifest = JSON.parse(stdout); } catch { return ''; }
  if (manifest.done) return '';
  const actions = manifest.actions || [];
  if (actions.length === 0) return '';
  const reminder = buildReminder(manifest);
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } });
}
