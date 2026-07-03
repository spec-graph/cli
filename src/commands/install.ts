import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

const SKILLS_REPO = 'https://github.com/spec-graph/skills.git';

/**
 * Clone spec-graph/skills from GitHub and install SKILL.md files
 * into .claude/skills/. Returns the number of skills installed.
 */
export function installSkills(root: string, opts?: { force?: boolean }): number {
  const targetDir = path.join(root, '.claude', 'skills');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-skills-'));

  try {
    // Clone skills repo
    execSync(`git clone --depth 1 ${SKILLS_REPO} "${tmpDir}"`, {
      stdio: 'pipe',
      timeout: 30_000,
    });

    const entries = fs.readdirSync(tmpDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('spec-graph-'));

    let installed = 0;
    for (const entry of entries) {
      const src = path.join(tmpDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(src)) continue;

      const destDir = path.join(targetDir, entry.name);
      const dest = path.join(destDir, 'SKILL.md');

      // Skip if already installed (unless --force)
      if (fs.existsSync(dest) && !opts?.force) {
        continue;
      }

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      installed++;
    }

    return installed;
  } finally {
    // Clean up temp clone
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function register(program: Command): void {
  program
    .command('install')
    .description('Install spec-graph skills from GitHub into .claude/skills/')
    .option('--force', 'overwrite existing skills')
    .option('--json', 'output as JSON')
    .action((opts) => {
      const root = process.cwd();
      const count = installSkills(root, { force: opts.force });

      if (opts.json) {
        console.log(JSON.stringify({ installed: count }));
      } else {
        console.log(chalk.green(`✓ ${count} skills installed from ${SKILLS_REPO}`));
        if (count === 0) {
          console.log(chalk.gray('  (all skills already present, use --force to overwrite)'));
        }
      }
    });
}
