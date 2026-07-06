#!/usr/bin/env node
import { execFileSync } from 'child_process';
import * as path from 'path';

// FIX: same shell-injection issue as rg-search.ts — switched from a
// string-interpolated execSync() shell command to execFileSync() with an
// argument array, so `pattern` can never be interpreted as shell syntax.
const pattern = process.argv[2];
const contextLines = process.argv[3] || '3';

if (!pattern) {
  console.error('Usage: grep-context <pattern> [context-lines]');
  process.exit(1);
}

if (!/^\d+$/.test(contextLines)) {
  console.error('❌ context-lines must be a non-negative integer.');
  process.exit(1);
}

const workspacePath = path.resolve('./workspace');

try {
  const result = execFileSync(
    'rg',
    [
      '--line-number', '--column', '--no-heading', '--smart-case',
      '--context', contextLines,
      '--glob', '!node_modules/*',
      pattern, workspacePath
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  );
  if (result.trim() === '') {
    console.log(`💡 No context matches found for pattern: ${pattern}`);
  } else {
    console.log(`--- MATCHES WITH ${contextLines} LINES OF CONTEXT ---\n`);
    console.log(result);
  }
} catch (err: any) {
  if (err.status === 1) {
    console.log(`💡 No context matches found for pattern: ${pattern}`);
  } else {
    console.error(`❌ Grep-context utility fault: ${err.message}`);
    process.exit(1);
  }
}
