#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

const IGNORE_DIRS = ['node_modules', '.git', 'build', 'dist', 'coverage'];

const baseWorkspacePath = path.resolve('./workspace');
if (!fs.existsSync(baseWorkspacePath)) {
  fs.mkdirSync(baseWorkspacePath, { recursive: true });
}

/**
 * FIX: the previous recursion boundary check was
 *   resolvedNextPath.startsWith(baseWorkspacePath)
 * — the same sibling-directory prefix bug as agent-patch.ts (a directory
 * named e.g. "workspace-shared" next to "workspace" would incorrectly pass).
 * Uses path.relative() instead, same as the fixed agent-patch.ts.
 */
function isInsideWorkspace(candidate: string): boolean {
  const relative = path.relative(baseWorkspacePath, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function buildTreeString(currentPath: string, prefix = '', depth = 0): string {
  if (depth > 3) return '';

  try {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    let output = '';
    const visibleEntries = entries.filter((entry) => !IGNORE_DIRS.includes(entry.name));

    visibleEntries.forEach((entry, index) => {
      const isLast = index === visibleEntries.length - 1;
      const pointer = isLast ? '└── ' : '├── ';
      output += `${prefix}${pointer}${entry.name}\n`;

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        const nextPath = path.join(currentPath, entry.name);
        const resolvedNextPath = path.resolve(nextPath);

        if (isInsideWorkspace(resolvedNextPath)) {
          output += buildTreeString(resolvedNextPath, nextPrefix, depth + 1);
        } else {
          output += `${prefix}│   ⚠️  [Security Exception: Recursive boundary violation dropped]\n`;
        }
      }
    });

    return output;
  } catch (err) {
    return `${prefix}⚠️  [Unable to read directory: ${err instanceof Error ? err.message : String(err)}]\n`;
  }
}

console.log('📁 Project Architecture Tree (Workspace Sandbox Domain):');
const treeData = buildTreeString(baseWorkspacePath);
console.log(treeData || '└── (empty directory)');
