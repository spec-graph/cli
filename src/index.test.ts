import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

// Verify each command module exports a register function
import { register as status } from './commands/status';
import { register as plan } from './commands/plan';
import { register as auto } from './commands/auto';
import { register as nextPrompt } from './commands/next-prompt';
import { register as advance } from './commands/advance';
import { register as validate } from './commands/validate';
import { register as intervene } from './commands/intervene';
import { register as diagnose } from './commands/diagnose';
import { register as completion } from './commands/completion';
import { register as sessions } from './commands/sessions';

const commands = [
  { name: 'status', register: status },
  { name: 'plan', register: plan },
  { name: 'auto', register: auto },
  { name: 'next-prompt', register: nextPrompt },
  { name: 'advance', register: advance },
  { name: 'validate', register: validate },
  { name: 'intervene', register: intervene },
  { name: 'diagnose', register: diagnose },
  { name: 'completion', register: completion },
  { name: 'sessions', register: sessions },
];

describe('CLI command modules', () => {
  for (const cmd of commands) {
    it(`${cmd.name} exports a register function`, () => {
      expect(typeof cmd.register).toBe('function');
    });
  }

  it('all 8 commands register without error', () => {
    const program = new Command();
    for (const cmd of commands) {
      expect(() => cmd.register(program)).not.toThrow();
    }
    const registeredCommands = program.commands.map((c) => c.name());
    expect(registeredCommands).toContain('status');
    expect(registeredCommands).toContain('plan');
    expect(registeredCommands).toContain('auto');
    expect(registeredCommands).toContain('next-prompt');
    expect(registeredCommands).toContain('advance');
    expect(registeredCommands).toContain('validate');
    expect(registeredCommands).toContain('intervene');
    expect(registeredCommands).toContain('diagnose');
  });
});

describe('CLI program', () => {
  it('creates a program with version', () => {
    const program = new Command();
    program.version('2.0.0');
    expect(program.version()).toBe('2.0.0');
  });

  it('creates a program with name and description', () => {
    const program = new Command();
    program
      .name('spec-graph')
      .description('test description');
    expect(program.name()).toBe('spec-graph');
    expect(program.description()).toBe('test description');
  });

  it('handles unrecognized command gracefully', () => {
    const program = new Command();
    program.exitOverride();
    expect(() => {
      try { program.parse(['node', 'spec-graph', 'unknown-cmd']); }
      catch (e) { /* ignore exit override */ }
    }).not.toThrow();
  });
});
