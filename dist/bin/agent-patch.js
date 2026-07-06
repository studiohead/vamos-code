#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
/**
 * Structural find/replace patch tool, confined to ./workspace.
 *
 * FIX: the previous boundary check was
 *   targetAbsolutePath.startsWith(resolvedWorkspaceDir)
 * which is a classic prefix-check bug — `/repo/workspace-evil/x` also
 * "starts with" `/repo/workspace`, so a path like `../workspace-evil/x`
 * would pass the check while resolving to a sibling directory outside the
 * sandbox entirely. This version uses path.relative() and rejects any
 * result that escapes via `..` or resolves to an absolute path.
 */
const [, , filePath, oldStr, newStr] = process.argv;
if (!filePath || oldStr === undefined || newStr === undefined) {
    console.error('❌ Usage: agent-patch <file_path> <old_string> <new_string>');
    process.exit(1);
}
try {
    const resolvedWorkspaceDir = path.resolve('./workspace');
    const targetAbsolutePath = path.resolve(resolvedWorkspaceDir, filePath);
    const relative = path.relative(resolvedWorkspaceDir, targetAbsolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.error('❌ Security Exception: Boundary violation detected on target execution landscape path matching.');
        process.exit(1);
    }
    if (path.basename(targetAbsolutePath) === '.env' || targetAbsolutePath.includes(`${path.sep}.git${path.sep}`)) {
        console.error('❌ Security Governance Violation: Protection lock hit on environmental secrets configuration targets.');
        process.exit(1);
    }
    if (!fs.existsSync(targetAbsolutePath)) {
        console.error(`❌ Construction Failure: Targeted file destination does not exist: ${filePath}`);
        process.exit(1);
    }
    const fileContent = fs.readFileSync(targetAbsolutePath, 'utf-8');
    // Normalize line breaks so multi-line matches survive CRLF/LF differences.
    const normalizedContent = fileContent.replace(/\r\n/g, '\n');
    const normalizedOld = oldStr.replace(/\r\n/g, '\n');
    const normalizedNew = newStr.replace(/\r\n/g, '\n');
    const occurrences = normalizedContent.split(normalizedOld).length - 1;
    if (occurrences === 0) {
        console.error(`❌ Construction Failure: Exact matching block not found in targeting path: ${filePath}`);
        process.exit(1);
    }
    if (occurrences > 1) {
        console.error(`❌ Match is ambiguous: found ${occurrences} occurrences in ${filePath}. Provide more surrounding context.`);
        process.exit(1);
    }
    const output = normalizedContent.replace(normalizedOld, normalizedNew);
    // Backup before writing so changes are always recoverable.
    fs.writeFileSync(`${targetAbsolutePath}.bak`, fileContent, 'utf-8');
    fs.writeFileSync(targetAbsolutePath, output, 'utf-8');
    console.log(`✅ Patched ${filePath} (backup: ${filePath}.bak).`);
}
catch (err) {
    console.error(`❌ I/O failure while patching ${filePath}: ${err.message}`);
    process.exit(1);
}
