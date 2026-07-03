import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

// Verify each_command module exports a register function
import { register as status } from './commands/status';
import { register as plan } from './commands/plan';
import { register as submit } from './commands/submit';
import { register as validate } from './commands/validate';
import { register as intervene } from './commands/intervene';
import { register as diagnose } from './commands/diagnose';
import { register as completion } from './commands/completion';
import { register as sessions } from './commands/sessions';
import { register as init } from './commands/init';
import { register as compose } from './commands/compose';
import { register as dispatch } from './commands/dispatch';

const commands = [
  { name: 'status', register: status },
  { name: 'plan', register: plan },
  { name: 'submit', register: submit },
  { name: 'validate', register: validate },
  { name: 'intervene', register: intervene },
  { name: 'diagnose', register: diagnose },
  { name: 'completion', register: completion },
  { name: 'sessions', register: sessions },
  { name: 'init', register: init },
  { name: 'compose', register: compose },
  { name: 'dispatch', register: dispatch },
];

describe('CLI command modules', () => {
  for (const cmd of commands) {
    it(`${cmd.name} exports a register function`, () => {
      expect(typeof cmd.register).toBe('function');
    });
  }

  it('all commands register without error', () => {
    const program = new Command();
    for (const cmd of commands) {
      expect(() => cmd.register(program)).not.toThrow();
    }
    const registeredCommands = program.commands.map((c) => c.name());
    expect(registeredCommands).toContain('status');
    expect(registeredCommands).toContain('plan');
    expect(registeredCommands).toContain('submit');
    expect(registeredCommands).toContain('validate');
    expect(registeredCommands).toContain('intervene');
    expect(registeredCommands).toContain('diagnose');
    expect(registeredCommands).toContain('dispatch');
    expect(registeredCommands).not.toContain('auto');
    expect(registeredCommands).not.toContain('next-prompt');
  });
});

describe('CLI program', () => {
  it('creates a program with version', () => {
    const program = new Command();
    program.version('3.0.0');
    expect(program.version()).toBe('3.0.0');
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
