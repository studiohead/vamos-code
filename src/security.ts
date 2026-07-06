import { parse } from 'unbash';
import * as path from 'path';

/**
 * The previous confirmation gate was:
 *   extractedCommand.includes('agent-patch') || includes('>') || includes('|')
 * which does not catch `curl x | bash`-without-pipe-char-tricks... actually
 * it DOES catch pipes, but misses everything else: `rm -rf ~`, `curl x -o f`,
 * `wget`, `chmod 777`, `&&`/`;` chaining, background jobs, denied binaries
 * invoked via absolute path, reading `.env`/`.ssh`/AWS credentials, etc. This
 * module walks the real unbash AST (rather than only string-matching)  to
 * close those gaps while keeping the same "confirm risky, run safe" shape
 * the rest of the codebase expects.
 */

const DENIED_BINARIES = new Set([
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'sftp', 'rsync', 'telnet',
  'sudo', 'su', 'chmod', 'chown', 'chgrp', 'passwd',
  'eval', 'exec', 'source', 'nohup', 'setsid', 'crontab',
  'dd', 'mkfs', 'shred', 'fdisk',
  'docker', 'podman', 'kubectl',
  'python', 'python3', 'perl', 'ruby', 'php',
  'bash', 'sh', 'zsh',
  'base64', 'xxd',
  'env', 'printenv', 'export', 'unset'
]);

const SENSITIVE_PATH_PATTERNS = [
  /(^|[/\\])\.env(\.[\w.-]+)?$/i,
  /(^|[/\\])\.aws[/\\]credentials$/i,
  /(^|[/\\])\.ssh[/\\]/i,
  /id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\/etc\/(passwd|shadow|sudoers)$/i
];

const RAW_STRING_DENY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&?\s*\}\s*;?\s*:/, reason: 'fork bomb pattern' },
  { pattern: /rm\s+(-\w*\s+)*-[a-z]*r[a-z]*f[a-z]*\s+(~|\/)(?:\s|$)/i, reason: 'recursive force-delete of home/root' }
];

export interface CommandRiskReport {
  isSafe: boolean;
  requiresConfirmation: boolean;
  reason: string;
}

function basename(cmdText: string): string {
  const parts = String(cmdText).split(/[\\/]/);
  return parts[parts.length - 1];
}

interface WalkState {
  detectedBinaries: string[];
  hasChaining: boolean;
  hasRedirects: boolean;
  hasBackground: boolean;
  literalStrings: string[];
}

function collectPropertyNames(node: any): Set<string> {
  const names = new Set<string>(Object.keys(node));
  let proto = Object.getPrototypeOf(node);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name === 'toJSON') continue;
      names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}

function walk(node: any, state: WalkState, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 200) return;

  if (Array.isArray(node)) {
    for (const child of node) walk(child, state, depth + 1);
    return;
  }

  if (node.type === 'Command' && node.name && typeof node.name.text === 'string') {
    state.detectedBinaries.push(basename(node.name.text));
  }
  if (node.type === 'Pipeline' || node.type === 'AndOr') state.hasChaining = true;
  if (node.background === true) state.hasBackground = true;
  if (Array.isArray(node.redirects) && node.redirects.length > 0) {
    state.hasRedirects = true;
    for (const r of node.redirects) {
      const target = r?.target?.text || r?.target?.value || r?.content;
      if (target) state.literalStrings.push(String(target));
    }
  }
  if (typeof node.text === 'string') state.literalStrings.push(node.text);
  if (typeof node.value === 'string') state.literalStrings.push(node.value);

  // Generic descent — deliberately does not rely on a fixed list of
  // "container" keys, and also reads prototype getters (unbash's Word
  // nodes expose `parts`/`value` as non-enumerable class accessors that a
  // plain Object.keys()/for-in walk would silently skip).
  for (const key of collectPropertyNames(node)) {
    if (key === 'pos' || key === 'end') continue;
    let value: any;
    try {
      value = node[key];
    } catch {
      continue;
    }
    if (value && typeof value === 'object') walk(value, state, depth + 1);
  }
}

export function analyzeCommand(rawBashString: string): CommandRiskReport {
  for (const { pattern, reason } of RAW_STRING_DENY_PATTERNS) {
    if (pattern.test(rawBashString)) {
      return { isSafe: false, requiresConfirmation: true, reason: `Security Governance Violation: ${reason}.` };
    }
  }

  let ast: any;
  try {
    ast = parse(rawBashString);
  } catch (err: any) {
    return {
      isSafe: false,
      requiresConfirmation: true,
      reason: `Syntax Interpretation Rejection: could not parse command (${err.message}).`
    };
  }
  if (Array.isArray(ast?.errors) && ast.errors.length > 0) {
    return {
      isSafe: false,
      requiresConfirmation: true,
      reason: `Syntax Interpretation Rejection: ${ast.errors.map((e: any) => e.message).join('; ')}`
    };
  }

  const state: WalkState = { detectedBinaries: [], hasChaining: false, hasRedirects: false, hasBackground: false, literalStrings: [] };
  walk(ast, state);

  for (const bin of state.detectedBinaries) {
    if (DENIED_BINARIES.has(bin.toLowerCase())) {
      return { isSafe: false, requiresConfirmation: true, reason: `Security Governance Violation: binary '${bin}' is on the deny list.` };
    }
  }

  for (const str of state.literalStrings) {
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(str)) {
        return { isSafe: false, requiresConfirmation: true, reason: `Security Governance Violation: command references a protected path (${str}).` };
      }
    }
  }

  const requiresConfirmation = state.hasChaining || state.hasRedirects || state.hasBackground || state.detectedBinaries.length > 1;
  return { isSafe: true, requiresConfirmation, reason: 'Passed structural analysis.' };
}
