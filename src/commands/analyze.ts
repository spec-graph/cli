import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function register(program: Command): void {
  program
    .command('analyze')
    .description('Cross-artifact consistency analysis')
    .option('--phase <phase>', 'specific phase to analyze')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const artifactsDir = path.join(process.cwd(), '.spec-graph', 'artifacts');
      const issues: string[] = [];

      if (fs.existsSync(artifactsDir)) {
        const files = fs.readdirSync(artifactsDir, { recursive: true }).filter(
          (f) => typeof f === 'string' && (f as string).endsWith('.md')
        ) as string[];

        for (const file of files) {
          const content = fs.readFileSync(path.join(artifactsDir, file), 'utf-8');
          // Simple heuristic: flag files with TODO markers
          if (content.includes('TODO') || content.includes('FIXME')) {
            issues.push(`${file}: contains unresolved TODO/FIXME`);
          }
          if (content.length < 50) {
            issues.push(`${file}: content suspiciously short (< 50 chars)`);
          }
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({ issues, artifactCount: issues.length }, null, 2));
      } else {
        if (issues.length === 0) {
          console.log('No consistency issues found.');
        } else {
          console.log(`Found ${issues.length} potential issues:`);
          for (const issue of issues) console.log(`  - ${issue}`);
        }
      }
    });
}
