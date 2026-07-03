import { describe, it, expect } from 'vitest';
import { processHookInput } from './hook';

function makeManifest(overrides: Record<string, unknown> = {}) {
  const { actions: actionOverrides, ...topOverrides } = overrides;
  const baseAction = {
    index: 1,
    type: 'perform_stage' as const,
    id: 'propose',
    description: "Perform 'propose' stage work",
    agent_id: 'pm',
    agent_prompt_ref: 'agents/pm-agent.md',
    model_tier: 'capable',
    requires_sub_agent: true,
    file_scope: { read: ['docs/'], write: ['docs/'] },
    prompt: 'You are the pm agent for a spec-graph workflow.',
    next_step: 'spec-graph submit --result \'{"artifacts": []}\'',
  };

  return {
    done: false,
    current_stage: 'propose',
    gate_passed: true,
    actions: [{ ...baseAction, ...(actionOverrides as object || {}) }],
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
    const manifest = { done: true, current_stage: 'integrate', actions: [] };
    expect(processHookInput(makeCtx(manifest))).toBe('');
  });

  it('returns empty string when manifest has no actions', () => {
    const manifest = { done: false, current_stage: 'propose', actions: [] };
    expect(processHookInput(makeCtx(manifest))).toBe('');
  });

  it('builds reminder for single sub-agent action', () => {
    const manifest = makeManifest();
    const result = processHookInput(makeCtx(manifest));

    expect(result).not.toBe('');
    const parsed = JSON.parse(result);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');

    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('<system-reminder>');
    expect(reminder).toContain('spec-graph dispatch output detected');
    expect(reminder).toContain('pm');
    expect(reminder).toContain('capable');
    expect(reminder).toContain('agents/pm-agent.md');
    expect(reminder).toContain('propose');
    expect(reminder).toContain('EXECUTION (sub-agent)');
    expect(reminder).toContain('coordinator-protocol.md');
    expect(reminder).toContain('AUTO-LOOP PROTOCOL');
    expect(reminder).not.toContain('You are the pm agent for a spec-graph workflow');
  });

  it('includes meeting info in reminder', () => {
    const manifest = makeManifest({
      meeting: {
        available: true,
        recommended: true,
        reason: 'High complexity',
        template: {
          id: 'requirements-meeting',
          purpose: 'Discuss requirements',
          participants: [
            { agent_id: 'pm', role: 'core', perspective: 'user needs' },
            { agent_id: 'architect', role: 'core', perspective: 'feasibility' },
          ],
          min_rounds: 2,
          max_rounds: 10,
        },
      },
    });
    const result = processHookInput(makeCtx(manifest));

    expect(result).not.toBe('');
    const parsed = JSON.parse(result);
    const reminder = parsed.hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Meeting');
    expect(reminder).toContain('requirements-meeting');
    expect(reminder).toContain('RECOMMENDED');
    expect(reminder).toContain('High complexity');
  });

  it('includes input_artifacts summary in reminder', () => {
    const manifest = makeManifest({
      actions: { input_artifacts: [
        { id: 'a', kind: 'req', path: 'a.md', content: '...' },
        { id: 'b', kind: 'req', path: 'b.md', content: '...' },
      ]},
    });
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Input artifacts: 2');
    expect(reminder).toContain('see manifest actions[0].input_artifacts');
  });

  it('includes gate failure counts when gate blocked', () => {
    const manifest = makeManifest({
      gate_passed: false,
      missing_artifacts: ['requirement/proposal', 'requirement/requirements'],
      failed_checks: ['lint'],
    });
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('Gate failures:');
    expect(reminder).toContain('missing_artifacts=2');
    expect(reminder).toContain('failed_checks=1');
  });

  it('handles verify_trace actions', () => {
    const manifest = {
      done: false,
      gate_passed: false,
      current_stage: 'propose',
      missing_traces: ['req-to-design'],
      actions: [{
        index: 1,
        type: 'verify_trace',
        id: 'req-to-design',
        description: 'Verify trace',
        requires_sub_agent: false,
      }],
    };
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain("Trace 'req-to-design' is required");
    expect(reminder).toContain('spec-graph trace add');
    expect(reminder).toContain('actions[0].trace_query');
  });

  it('handles deterministic run_check actions', () => {
    const manifest = {
      done: false,
      gate_passed: true,
      current_stage: 'propose',
      actions: [{
        index: 1,
        type: 'run_check',
        id: 'lint-check',
        description: 'Run lint',
        requires_sub_agent: false,
        check_command: 'npm run lint',
      }],
    };
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('NO — run check_command directly via Bash');
    expect(reminder).toContain('npm run lint');
    expect(reminder).not.toContain('Dispatch via Agent tool');
  });

  it('detects dispatch in chained commands', () => {
    const manifest = makeManifest();
    const result = processHookInput(makeCtx(manifest, 'cd docs && spec-graph dispatch --json'));

    expect(result).not.toBe('');
    const parsed = JSON.parse(result);
    expect(parsed.hookSpecificOutput).toBeDefined();
  });

  it('handles parallel wave actions', () => {
    const manifest = {
      done: false,
      gate_passed: true,
      current_stage: 'implement',
      actions: [
        {
          index: 1,
          type: 'perform_stage',
          id: 'impl-cap-1',
          agent_id: 'developer',
          model_tier: 'standard',
          requires_sub_agent: true,
          parallel_group: 0,
          prompt: 'Implement cap 1',
          next_step: 'spec-graph submit ...',
        },
        {
          index: 2,
          type: 'perform_stage',
          id: 'impl-cap-2',
          agent_id: 'developer',
          model_tier: 'standard',
          requires_sub_agent: true,
          parallel_group: 0,
          prompt: 'Implement cap 2',
          next_step: 'spec-graph submit ...',
        },
      ],
    };
    const result = processHookInput(makeCtx(manifest));

    const reminder = JSON.parse(result).hookSpecificOutput.additionalContext;
    expect(reminder).toContain('PARALLEL');
    expect(reminder).toContain('impl-cap-1');
    expect(reminder).toContain('impl-cap-2');
    expect(reminder).toContain('2 sub-agents');
  });
});
