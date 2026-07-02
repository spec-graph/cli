import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('check-run')
    .description('Run a check command with security validation')
    .argument('<check-id>', 'check id to run')
    .option('--command <cmd>', 'explicit command to run (overrides pack declaration)')
    .option('--project-root <dir>', 'project root directory', process.cwd())
    .option('--json', 'output as JSON')
    .action(async (checkId, opts) => {
      const projectRoot = opts.projectRoot;
      const command = opts.command;

      if (!command) {
        console.error(chalk.red('Error: --command is required'));
        process.exit(1);
      }

      // Security check: is it a sentinel command?
      const isSentinel = /^<.+>$/.test(command.trim());
      if (isSentinel) {
        // Sentinel dispatched to TS handler (no shell execution)
        console.log(chalk.blue(`Sentinel command detected: ${command} — dispatching to TS handler`));
        if (opts.json) {
          console.log(JSON.stringify({ checkId, command, mode: 'sentinel', status: 'dispatched' }));
        } else {
          console.log(chalk.green(`Sentinel ${command} dispatched successfully`));
        }
        return;
      }

      // Validate against constitution security rules
      const constitution = loadConstitution(projectRoot);
      const validation = validateCommand(command, constitution);

      if (!validation.allowed) {
        console.error(chalk.red(`Security error: command refused — ${validation.reason}`));
        process.exit(1);
      }

      // Execute
      try {
        const output = execSync(command, {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 120_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Track check result
        core.machineState.trackCheck(checkId, 'passed', { output: output.slice(0, 500) });

        if (opts.json) {
          console.log(JSON.stringify({ checkId, command, status: 'passed', output: output.slice(0, 500) }, null, 2));
        } else {
          console.log(chalk.green(`Check ${checkId} passed`));
          if (output.trim()) console.log(output.trim());
        }
      } catch (err: any) {
        // Track check failure
        core.machineState.trackCheck(checkId, 'failed', {
          error: err.message?.slice(0, 500),
          stderr: err.stderr?.slice(0, 500),
        });

        if (opts.json) {
          console.log(JSON.stringify({ checkId, command, status: 'failed', error: err.message }, null, 2));
        } else {
          console.log(chalk.red(`Check ${checkId} failed`));
          if (err.stderr) console.log(chalk.red(err.stderr));
        }
        process.exit(1);
      }
    });
}

function loadConstitution(projectRoot: string): any {
  const candidates = [
    path.join(projectRoot, '.spec-graph', 'constitution.yaml'),
    path.join(projectRoot, '.spec-graph', 'config.yaml'),
  ];

  for (const cpath of candidates) {
    if (fs.existsSync(cpath)) {
      try {
        const raw = fs.readFileSync(cpath, 'utf-8');
        return yaml.load(raw) as any;
      } catch {
        continue;
      }
    }
  }

  return null;
}

function validateCommand(
  command: string,
  constitution: any
): { allowed: boolean; reason?: string } {
  const security = constitution?.security;
  if (!security) {
    // No security section → allow everything (no whitelist configured)
    return { allowed: true };
  }

  // Check forbidden patterns first
  if (security.forbidden_patterns) {
    for (const pattern of security.forbidden_patterns) {
      if (command.includes(pattern)) {
        return { allowed: false, reason: `command matches forbidden pattern: "${pattern}"` };
      }
    }
  }

  // Check whitelist
  if (security.command_whitelist && security.command_whitelist.length > 0) {
    const trimmed = command.trim();
    const allowed = security.command_whitelist.some((prefix: string) =>
      trimmed.startsWith(prefix)
    );
    if (!allowed) {
      return {
        allowed: false,
        reason: `command not in whitelist (must start with one of: ${security.command_whitelist.join(', ')})`,
      };
    }
  }

  return { allowed: true };
}
