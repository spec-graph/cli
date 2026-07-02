import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

const CONFIG_TEMPLATE = `# spec-graph project configuration
# See: https://github.com/spec-graph/spec-graph

version: "1"

# Project context (auto-detected on init, customize as needed)
context:
  language: "<auto-detected>"
  framework: "<auto-detected>"
  runtime: "node"

# Project-specific rules (guidance for sub-agents)
rules:
  code_style: "follow project conventions"
  test_requirement: "every source file has a corresponding test file"

# Reference files (included in dispatch prompts for context)
references:
  readme: "README.md"
`;

export function register(program: Command): void {
  program
    .command('init')
    .description('Initialize a new spec-graph project')
    .option('--force', 'overwrite existing .spec-graph directory')
    .option('--skip-hook', 'skip dispatch-watcher hook registration')
    .option('--skip-compose', 'skip auto-compose even if packs/ exists')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const root = process.cwd();
      const specGraphDir = path.join(root, '.spec-graph');
      const result: {
        created: string[];
        hookRegistered: boolean;
        composed: boolean;
        warnings: string[];
      } = { created: [], hookRegistered: false, composed: false, warnings: [] };

      // 1. Check existing
      if (fs.existsSync(specGraphDir) && !opts.force) {
        const msg = `.spec-graph/ already exists. Use --force to overwrite.`;
        if (opts.json) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          console.error(chalk.red(msg));
        }
        process.exit(1);
      }

      // 2. Create .spec-graph/ directory
      if (opts.force && fs.existsSync(specGraphDir)) {
        fs.rmSync(specGraphDir, { recursive: true, force: true });
      }
      fs.mkdirSync(specGraphDir, { recursive: true });
      result.created.push('.spec-graph/');

      // 3. Create sessions/ directory
      fs.mkdirSync(path.join(specGraphDir, 'sessions'), { recursive: true });
      result.created.push('.spec-graph/sessions/');

      // 4. Write config.yaml with auto-detected profile
      const profile = core.sense.sense(root);
      const configContent = CONFIG_TEMPLATE
        .replace('<auto-detected>', profile.language || 'unknown')
        .replace(/<auto-detected>/, profile.framework || 'unknown');
      fs.writeFileSync(path.join(specGraphDir, 'config.yaml'), configContent, 'utf-8');
      result.created.push('.spec-graph/config.yaml');

      // 5. Register hook (unless --skip-hook)
      if (!opts.skipHook) {
        try {
          registerHook(root);
          result.hookRegistered = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.warnings.push(`Hook registration failed: ${msg}`);
        }
      }

      // 6. Auto-compose if packs/ exists (unless --skip-compose)
      if (!opts.skipCompose) {
        const packsDir = findPacksDir(root);
        if (packsDir) {
          try {
            const profileFacts = buildProfileFacts(profile);
            const outputPath = path.join(specGraphDir, 'graph.yaml');
            core.composer.composeToFile(
              { packsDir, profileFacts },
              outputPath
            );
            result.composed = true;
            result.created.push('.spec-graph/graph.yaml');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.warnings.push(`Auto-compose failed: ${msg}`);
          }
        }
      }

      // 7. Output
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('✓ .spec-graph/ initialized'));
        for (const item of result.created) {
          console.log(chalk.gray(`  ${item}`));
        }
        if (result.hookRegistered) {
          console.log(chalk.green('✓ dispatch-watcher hook registered'));
        }
        if (result.composed) {
          console.log(chalk.green('✓ graph.yaml composed'));
        }
        for (const w of result.warnings) {
          console.log(chalk.yellow(`⚠ ${w}`));
        }
        if (!result.hookRegistered && !opts.skipHook) {
          console.log(chalk.gray('  Register hook: spec-graph install'));
        }
      }
    });
}

/**
 * Register dispatch-watcher hook in .claude/settings.json
 */
function registerHook(root: string): void {
  const claudeDir = path.join(root, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  fs.mkdirSync(claudeDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  // Resolve hook script path relative to CLI install
  // Try multiple locations: monorepo dev, global install, project-local
  const hookScriptCandidates = [
    // Monorepo dev: packages/cli/src/commands/../../../core/hooks/dispatch-watcher.mjs
    path.resolve(__dirname, '../../../core/hooks/dispatch-watcher.mjs'),
    // Global install: look for spec-graph in node_modules
    findGlobalHookScript(),
  ].filter(Boolean) as string[];

  const hookScript = hookScriptCandidates.find(p => fs.existsSync(p));
  if (!hookScript) {
    throw new Error('dispatch-watcher.mjs not found. Run from monorepo or reinstall spec-graph.');
  }

  const hookCommand = `node "${hookScript}"`;

  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
  const postToolUse = (hooks.PostToolUse || []) as Array<{ matcher: string; command: string }>;

  // Idempotent: skip if already registered
  const alreadyRegistered = postToolUse.some(
    h => h.matcher === 'Bash' && h.command.includes('dispatch-watcher')
  );
  if (alreadyRegistered) {
    return;
  }

  postToolUse.push({
    matcher: 'Bash',
    command: hookCommand,
  });

  hooks.PostToolUse = postToolUse;
  settings.hooks = hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function findGlobalHookScript(): string | null {
  // Try to find spec-graph installation via require.resolve
  try {
    const cliIndex = require.resolve('spec-graph/dist/index.js');
    const cliDir = path.dirname(cliIndex);
    // spec-graph/dist/index.js → ../node_modules/spec-graph/
    // Hook is at packages/core/hooks/dispatch-watcher.mjs in monorepo
    // Or at dist/hooks/dispatch-watcher.mjs in global install
    const candidates = [
      path.resolve(cliDir, '../../packages/core/hooks/dispatch-watcher.mjs'),
      path.resolve(cliDir, '../hooks/dispatch-watcher.mjs'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } catch {
    // Not installed globally
  }
  return null;
}

function findPacksDir(root: string): string | null {
  const candidates = [
    path.join(root, 'packs'),
    path.join(root, '.spec-graph', 'packs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Look for spec-graph installed packs
  try {
    const corePath = require.resolve('@spec-graph/core/package.json');
    const coreDir = path.dirname(corePath);
    const packsDir = path.join(coreDir, 'packs');
    if (fs.existsSync(packsDir)) return packsDir;
  } catch {
    // Not installed
  }
  return null;
}

/**
 * Convert sense profile to composer profileFacts format
 */
function buildProfileFacts(
  profile: ReturnType<typeof core.sense.sense>
): Record<string, { value: string }> {
  const facts: Record<string, { value: string }> = {};
  if (profile.language) facts.language = { value: profile.language };
  if (profile.framework) facts.framework = { value: profile.framework };
  if (profile.runtime) facts.runtime = { value: profile.runtime };
  if (profile.testFramework) facts.testFramework = { value: profile.testFramework };
  if (profile.buildTool) facts.buildTool = { value: profile.buildTool };
  facts.brownfield = { value: profile.brownfield ? 'true' : 'false' };
  if (profile.existingFeatures.length > 0) {
    facts.existingFeatures = { value: profile.existingFeatures.join(',') };
  }
  return facts;
}
