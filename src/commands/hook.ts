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
    const agentName = a.agent?.split('/').pop()?.replace('-agent.md', '') || 'unknown';
    summaryLine = `Stage: ${manifest.stage} | Action: ${a.id} | Agent: ${agentName}`;

    const preStep = a.pre_step
      ? `\n**Before dispatching**, run: \`${a.pre_step}\`\n`
      : '';
    const postStep = a.post_step
      ? `\n**After sub-agent produces output**, run: \`${a.post_step}\`\n`
      : '';
    const completeStep = a.complete_step
      ? `\n**If review passes**, run: \`${a.complete_step}\`\n`
      : '';

    executionBlock = `1. ${a.pre_step ? `Run pre-step: \`${a.pre_step}\`\n2. ` : ''}Dispatch via Agent tool with the following prompt:

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
${preStep}${postStep}${completeStep}
3. Sub-agent writes artifact to ${a.output}, returns status-report
4. Parse status-report:
   - DONE → read artifact from disk,${a.post_step ? ` run post-step: \`${a.post_step}\`, if review passes → \`${a.complete_step}\`, then` : ''} run submit
   - DONE_WITH_CONCERNS → submit with concerns noted
   - NEEDS_CONTEXT → report to user
   - BLOCKED → escalate to user
5. Build result: {"artifacts": [{"path": "${a.output}", "content": "<read from disk>"}]}
6. Run: spec-graph submit --session ${manifest.session_id} --result '{"artifacts":[{"path":"${a.output}","content":"<read from disk>"}]}'`;
  } else {
    const waveDescriptions = sortedGroups.map(([g, gas]) =>
      gas.length === 1 ? `Wave ${g}: ${gas[0].id}` : `Wave ${g}: PARALLEL — ${gas.length} sub-agents (${gas.map(a => a.id).join(', ')})`);
    summaryLine = `Stage: ${manifest.stage} | ${actions.length} actions across ${sortedGroups.length} wave(s)`;
    executionBlock = `PARALLEL dispatch:
${waveDescriptions.join('\n')}

For EACH sub-agent:
1. Run pre_step (if present) BEFORE dispatching
2. Dispatch via Agent tool with prompt containing:
   role_file: <action.agent>
   skills_dirs: <action.skills>
   context_files: <action.upstream>
   output_path: <action.output>

After ALL sub-agents complete:
1. Parse each status-report
2. Read each artifact from disk
3. Run post_step for each action (e.g., task review)
4. If review passes, run complete_step for each action
5. Build combined result JSON
6. spec-graph submit --session ${manifest.session_id} --result '{"artifacts":[...]}'`;
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
  const stdout = ctx.tool_response?.stdout || '';

  // ── Handle task start ──────────────────────────────────────
  if (command.includes('spec-graph task start')) {
    if (stdout.includes('marked as running')) {
      const sessionMatch = stdout.match(/session:\s*([^\s)]+)/);
      const taskIdMatch = stdout.match(/Task\s+'(\S+)'/);
      const sessionHint = sessionMatch ? ` --session ${sessionMatch[1]}` : '';
      const taskId = taskIdMatch ? taskIdMatch[1] : '';
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✓ Task '${taskId}' started. Now dispatch the sub-agent:

  spec-graph dispatch${sessionHint} --json

The dispatch manifest contains the agent, skills, upstream, and output paths for this task.
After the sub-agent produces output → spec-graph task review ${taskId}${sessionHint}
</system-reminder>` }});
    }
    return '';
  }

  // ── Handle task review ─────────────────────────────────────
  if (command.includes('spec-graph task review')) {
    if (stdout.includes('passed review')) {
      const completeMatch = stdout.match(/spec-graph task complete (\S+)/);
      const completeCmd = completeMatch ? completeMatch[0] : '';
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✓ Task review PASSED. Complete the task:

  ${completeCmd}

After completion, run submit to advance the workflow.
</system-reminder>` }});
    }
    if (stdout.includes('failed review') || stdout.includes('✗')) {
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✗ Task review FAILED. Fix the issues and re-review:

  ${command}

Review the check output above to understand what needs to be fixed.
</system-reminder>` }});
    }
    return '';
  }

  // ── Handle task complete ───────────────────────────────────
  if (command.includes('spec-graph task complete')) {
    if (stdout.includes('completed')) {
      const sessionMatch = stdout.match(/session:\s*([^\s)]+)/);
      const sessionId = sessionMatch ? sessionMatch[1] : '';
      const nextMatch = stdout.match(/Next runnable task:\s*(\S+)/);
      let nextHint = '';
      if (nextMatch) {
        const nextTask = nextMatch[1];
        const sid = sessionId ? ` --session ${sessionId}` : '';
        nextHint = `\nNext task: **${nextTask}**. Continue the loop:\n  spec-graph task start ${nextTask}${sid}`;
      } else {
        const sid = sessionId ? ` --session ${sessionId}` : '';
        nextHint = `\nAll tasks complete for this stage. Advance the workflow:\n  spec-graph submit${sid} --result '{"artifacts":[...]}'`;
      }

      // Check if we should suggest checkpoint (every 3 tasks)
      let checkpointHint = '';
      if (sessionId) {
        try {
          const csvRow = core.sessionIndex.get(process.cwd(), sessionId);
          const completedCount = csvRow?.completed_tasks?.split(',').filter(Boolean).length || 0;
          if (completedCount > 0 && completedCount % 3 === 0) {
            checkpointHint = `\n\n💡 Context checkpoint: ${completedCount} tasks completed. Consider running:\n  spec-graph checkpoint --session ${sessionId}\nThis compresses earlier task history to save context space.`;
          }
        } catch {
          // Ignore errors
        }
      }

      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✓ Task completed.${nextHint}${checkpointHint}
</system-reminder>` }});
    }
    return '';
  }

  // ── Handle submit ──────────────────────────────────────────
  if (command.includes('spec-graph submit')) {
    // Extract session ID from the command for use in reminders.
    const sidMatch = command.match(/--session\s+([^\s)]+)/);
    const sessionHint = sidMatch ? ` --session ${sidMatch[1]}` : '';

    // Try to parse the JSON result from stdout (may have surrounding text).
    let result: { advanced?: boolean; done?: boolean; nextStage?: string; diagnosis?: unknown } | null = null;
    try {
      // Find the JSON object in stdout (handles cases where output has extra text).
      const jsonMatch = stdout.match(/\{[\s\S]*"advanced"[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch {
      // Non-JSON output — fall through to fallback.
    }

    if (result) {
      if (result.done) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✓ spec-graph workflow COMPLETE! All 9/9 stages completed.

Archive the session to finalize:
  spec-graph sessions archive --session ${sidMatch ? sidMatch[1] : '<id>'}
</system-reminder>` }});
      }
      if (result.advanced) {
        const next = result.nextStage || 'unknown';
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✓ Gate PASSED → advanced to "${next}". Continue the workflow:

  spec-graph dispatch${sessionHint} --json
</system-reminder>` }});
      }
      if (result.diagnosis) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
✗ Gate FAILED. Diagnosis: ${JSON.stringify(result.diagnosis)}

1. Read the diagnosis above to understand what failed
2. Fix the artifact based on the diagnosis
3. Re-submit: spec-graph submit${sessionHint} --result '<json>'
4. Or force-advance if the gate is too strict: spec-graph intervene force-advance${sessionHint}
</system-reminder>` }});
      }
    }

    // Fallback: submit completed but output wasn't parseable.
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<system-reminder>
⚠ spec-graph submit completed but output format was unexpected.

Check the output above. If the gate passed:
  spec-graph dispatch${sessionHint} --json
If blocked and need to force-advance:
  spec-graph intervene force-advance${sessionHint}
</system-reminder>` }});
  }

  // ── Handle dispatch ────────────────────────────────────────
  if (!command.includes('spec-graph dispatch')) return '';
  let manifest: RoutingManifest;
  try { manifest = JSON.parse(stdout); } catch { return ''; }
  if (manifest.done) return '';
  const actions = manifest.actions || [];
  if (actions.length === 0) return '';
  const reminder = buildReminder(manifest);
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } });
}
