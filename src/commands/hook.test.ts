import { describe, it, expect } from 'vitest';
import { processHookInput } from './hook';

// V2 dispatch manifest format matching DispatchAction interface.
function makeV2Action(overrides: Record<string, unknown> = {}) {
  return {
    id: 'propose',
    description: "Perform 'propose' stage work",
    agent: 'agents/pm-agent.md',
    skills: ['foundation.pack/stages/propose/skills/requirement-analysis'],
    upstream: [],
    output: '/tmp/propose/proposal.md',
    checks: [],
    ...overrides,
  };
}

function makeV2Manifest(overrides: Record<string, unknown> = {}) {
  const { actions: actionOverrides, ...topOverrides } = overrides;
  // If actionOverrides is an array, use it directly as the actions list.
  let actionsList;
  if (Array.isArray(actionOverrides)) {
    actionsList = actionOverrides;
  } else if (actionOverrides && typeof actionOverrides === 'object') {
    actionsList = [{ ...makeV2Action(), ...actionOverrides }];
  } else {
    actionsList = [makeV2Action()];
  }
  return {
    version: '2',
    session_id: 'test-20260705-001',
    stage: 'propose',
    intent: 'Test intent',
    done: false,
    actions: actionsList,
    ...topOverrides,
  };
}

function makeCtx(manifest: unknown, cmd = 'spec-graph dispatch --json') {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: cmd },
    tool_response: { stdout: JSON.stringify(manifest), exitCode: 0 },
  });
}

describe('hook dispatch', () => {
  it('returns empty string for empty stdin', () => {
    expect(processHookInput('')).toBe('');
    expect(processHookInput('   ')).toBe('');
  });

  it('returns empty string for malformed JSON', () => {
    expect(processHookInput('not json')).toBe('');
  });

  it('returns empty string when tool is not Bash', () => {
    const input = JSON.stringify({
      tool_name: 'Read',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: '{}', exitCode: 0 },
    });
    expect(processHookInput(input)).toBe('');
  });

  it('returns empty string when command is not dispatch', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_response: { stdout: '{"done": false}', exitCode: 0 },
    });
    expect(processHookInput(input)).toBe('');
  });

  it('returns empty string when stdout is not JSON', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph dispatch --json' },
      tool_response: { stdout: 'human readable', exitCode: 0 },
    });
    expect(processHookInput(input)).toBe('');
  });

  it('returns empty string when manifest.done is true', () => {
    const manifest = makeV2Manifest({ done: true, stage: 'integrate', actions: [] });
    expect(processHookInput(makeCtx(manifest))).toBe('');
  });

  it('returns empty string when manifest has no actions', () => {
    const manifest = makeV2Manifest({ actions: [], done: false });
    expect(processHookInput(makeCtx(manifest))).toBe('');
  });

  it('builds reminder for single sub-agent action', () => {
    const manifest = makeV2Manifest({
      actions: makeV2Action({
        id: 'specify',
        agent: 'agents/pm-agent.md',
        skills: ['foundation.pack/stages/specify/skills/requirement-analysis'],
        description: 'Execute specify stage',
      }),
    });
    const result = processHookInput(makeCtx(manifest));

    expect(result).not.toBe('');
    const parsed = JSON.parse(result);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');

    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('<system-reminder>');
    expect(reminder).toContain('spec-graph dispatch output detected');
    expect(reminder).toContain('pm');
    expect(reminder).toContain('agents/pm-agent.md');
    expect(reminder).toContain('specify');
    expect(reminder).toContain('DONE');
    expect(reminder).toContain('Auto-loop');
  });

  it('includes task lifecycle steps in implement stage', () => {
    const manifest = makeV2Manifest({
      stage: 'implement',
      actions: makeV2Action({
        id: 'user-model',
        agent: 'agents/developer-agent.md',
        description: 'User data model and storage',
        pre_step: 'spec-graph task start user-model --session test-20260705-001',
        post_step: 'spec-graph task review user-model --session test-20260705-001',
        complete_step: 'spec-graph task complete user-model --session test-20260705-001',
      }),
    });
    const result = processHookInput(makeCtx(manifest));

    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('pre-step');
    expect(reminder).toContain('task start user-model');
    expect(reminder).toContain('post-step');
    expect(reminder).toContain('task review user-model');
    expect(reminder).toContain('task complete user-model');
  });

  it('handles parallel wave actions', () => {
    const manifest = makeV2Manifest({
      stage: 'implement',
      session_id: 'impl-test-20260705-001',
      actions: [
        {
          ...makeV2Action({
            id: 'impl-cap-1',
            agent: 'pack/developer-agent.md',
            parallel_group: 0,
          }),
        },
        {
          ...makeV2Action({
            id: 'impl-cap-2',
            agent: 'pack/developer-agent.md',
            parallel_group: 0,
          }),
        },
      ],
    });
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('PARALLEL');
    expect(reminder).toContain('impl-cap-1');
    expect(reminder).toContain('impl-cap-2');
    expect(reminder).toContain('2 sub-agents');
  });

  it('detects dispatch in chained commands', () => {
    const manifest = makeV2Manifest();
    const result = processHookInput(makeCtx(manifest, 'cd docs && spec-graph dispatch --json'));

    expect(result).not.toBe('');
    const parsed = JSON.parse(result);
    expect(parsed.hookSpecificOutput).toBeDefined();
  });

  it('triggers reminder on task start with session hint', () => {
    const ctx = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph task start user-model --session test-20260705-001' },
      tool_response: { stdout: "✓ Task 'user-model' marked as running (session: test-20260705-001)", exitCode: 0 },
    });
    const result = processHookInput(ctx);
    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Task');
    expect(reminder).toContain('user-model');
    expect(reminder).toContain('dispatch');
    expect(reminder).toContain('--session test-20260705-001');
  });

  it('triggers reminder on task review pass', () => {
    const ctx = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph task review user-model --session test-20260705-001' },
      tool_response: { stdout: "✓ ✓ Task 'user-model' passed review\n  Run: spec-graph task complete user-model --session test-20260705-001", exitCode: 0 },
    });
    const result = processHookInput(ctx);
    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('PASSED');
    expect(reminder).toContain('task complete');
  });

  it('triggers reminder on task complete with next task', () => {
    const ctx = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph task complete user-model --session test-20260705-001' },
      tool_response: { stdout: "✓ Task 'user-model' completed (session: test-20260705-001)\n→ Next runnable task: auth-endpoints\n  Run: spec-graph task start auth-endpoints --session test-20260705-001", exitCode: 0 },
    });
    const result = processHookInput(ctx);
    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('completed');
    expect(reminder).toContain('auth-endpoints');
  });

  it('triggers reminder on submit with session parsing', () => {
    const ctx = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph submit --result stuff --session test-20260705-001' },
      tool_response: { stdout: '{"advanced":true,"nextStage":"design","done":false}', exitCode: 0 },
    });
    const result = processHookInput(ctx);
    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Gate PASSED');
    expect(reminder).toContain('design');
    expect(reminder).toContain('--session test-20260705-001');
  });

  it('fallback reminder on unparseable submit output', () => {
    const ctx = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'spec-graph submit --session test-20260705-001' },
      tool_response: { stdout: 'some human-readable gate evaluation result', exitCode: 0 },
    });
    const result = processHookInput(ctx);
    expect(result).not.toBe('');
    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('format was unexpected');
    expect(reminder).toContain('force-advance');
  });
});
