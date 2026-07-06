#!/usr/bin/env node
import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * FIX: the previous implementation built a shell command string via
 * template-literal interpolation of the user/agent-supplied `pattern`
 * straight into an execSync() call (which runs through a shell by
 * default). A pattern like `"; rm -rf ~ #` would close the quote and
 * inject arbitrary shell commands. Using execFileSync() with an argument
 * array runs ripgrep directly with no shell involved, so pattern content
 * can never be interpreted as shell syntax no matter what it contains.
 */
const workspacePath = path.resolve('./workspace');
const pattern = process.argv[2];

if (!pattern) {
  console.error('Usage: rg-search <regex-pattern>');
  process.exit(1);
}

try {
  const result = execFileSync(
    'rg',
    ['--line-number', '--column', '--no-heading', '--smart-case', '--glob', '!node_modules/*', pattern, workspacePath],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  );
  if (result.trim() === '') {
    console.log(`💡 No matches found for pattern: ${pattern}`);
  } else {
    console.log(result);
  }
} catch (err: any) {
  if (err.status === 1) {
    console.log(`💡 No matches found for pattern: ${pattern}`);
  } else {
    console.error(`❌ Search utility fault: ${err.message}`);
    process.exit(1);
  }
}
