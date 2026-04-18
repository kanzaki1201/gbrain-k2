import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { runLint } from '../src/commands/lint.ts';

const createdDirs: string[] = [];
const configPath = join(homedir(), '.gbrain', 'config.json');
const originalConfig = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

function writeMarkdown(path: string, body: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}

async function captureRunLint(args: string[]): Promise<string[]> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts: unknown[]) => logs.push(parts.join(' '));
  console.error = (...parts: unknown[]) => errors.push(parts.join(' '));
  try {
    await runLint(args);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return [...logs, ...errors];
}

afterEach(() => {
  if (originalConfig === null) {
    if (existsSync(configPath)) unlinkSync(configPath);
  } else {
    mkdirSync(join(homedir(), '.gbrain'), { recursive: true });
    writeFileSync(configPath, originalConfig);
  }
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('runLint config-backed excludes', () => {
  test('skips sources and human by default', async () => {
    if (existsSync(configPath)) unlinkSync(configPath);

    const repo = makeTempDir('gbrain-repo-');
    writeMarkdown(join(repo, 'projects', 'good.md'), '---\ntitle: Good\ntype: project\ncreated: 2026-04-17\n---\n');
    writeMarkdown(join(repo, 'sources', 'bad.md'), 'no frontmatter\n');
    writeMarkdown(join(repo, 'human', 'bad.md'), 'no frontmatter\n');

    const output = await captureRunLint([repo]);
    const joined = output.join('\n');

    expect(joined).toContain('1 pages scanned. 0 issue(s) in 0 page(s).');
    expect(joined).not.toContain('sources/bad.md');
    expect(joined).not.toContain('human/bad.md');
  });

  test('uses lint_exclude_paths from config.json', async () => {
    mkdirSync(join(homedir(), '.gbrain'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ engine: 'pglite', database_path: '/tmp/brain.pglite', lint_exclude_paths: ['archive'] }, null, 2),
    );

    const repo = makeTempDir('gbrain-repo-');
    writeMarkdown(join(repo, 'archive', 'bad.md'), 'no frontmatter\n');
    writeMarkdown(join(repo, 'sources', 'bad.md'), 'no frontmatter\n');
    writeMarkdown(join(repo, 'notes', 'bad.md'), 'no frontmatter\n');

    const output = await captureRunLint([repo]);
    const joined = output.join('\n');

    expect(joined).toContain('2 pages scanned. 2 issue(s) in 2 page(s).');
    expect(joined).toContain('sources/bad.md');
    expect(joined).toContain('notes/bad.md');
    expect(joined).not.toContain('archive/bad.md');
  });
});
