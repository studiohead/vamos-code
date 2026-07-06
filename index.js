import { parse } from 'unbash';
import { execSync } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Hold variables in a configuration object we can read dynamically
export const config = {
  MAX_CONTEXT_TOKENS: 1000000,
  estimatedRollingTokens: 0,
  AWS_BEDROCK_API_KEY: '',
  AWS_REGION: 'us-east-1'
};

const BANNED_BINARIES = ['curl', 'wget', 'ssh', 'scp', 'chmod', 'chown', 'alias', 'ncat', 'nc'];

let rl; // Keep terminal interface isolated

/**
 * Reads and populates configuration from .env at runtime
 */
export function initializeEnvironment() {
  try {
    const envPath = path.resolve('./.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split(/\r?\n/);
      
      for (const line of lines) {
        if (!line || line.trim().startsWith('#')) continue;
        
        const [key, ...valueParts] = line.split('=');
        if (key) {
          const rawValue = valueParts.join('=').trim();
          const sanitizedValue = rawValue.replace(/^["']|["']$/g, '');
          
          const trimmedKey = key.trim();
          if (trimmedKey === 'MAX_CONTEXT_TOKENS') {
            const parsedLimit = parseInt(sanitizedValue, 10);
            if (!isNaN(parsedLimit)) config.MAX_CONTEXT_TOKENS = parsedLimit;
          }
          if (trimmedKey === 'AWS_BEDROCK_API_KEY') {
            config.AWS_BEDROCK_API_KEY = sanitizedValue;
          }
          if (trimmedKey === 'AWS_REGION') {
            config.AWS_REGION = sanitizedValue;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to read .env file (${err.message}). Using defaults.`);
  }

  // Spin up the terminal interface only when needed
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  if (!fs.existsSync('./workspace')) fs.mkdirSync('./workspace');
  
  return config;
}

const askHuman = (query) => new Promise((resolve) => rl.question(query, resolve));

export function closeTerminalInterface() {
  if (rl) rl.close();
}

/**
 * Stage 1 & 2: Command Deconstruction and Risk Profile Parsing
 */
function analyzeCommandStructure(rawBashString) {
  if (rawBashString.includes('.env')) {
    return {
      isSafe: false,
      reason: "Security Governance Violation: Protection lock hit on environmental secrets configuration targets."
    };
  }

  const analysisReport = {
    isSafe: true,
    reason: "Passed structure analysis.",
    detectedBinaries: [],
    hasDestructiveOperators: false,
    hasFileRedirects: false
  };

  try {
    const ast = parse(rawBashString);
    
    const inspectNode = (node) => {
      if (!node) return;
      if (node.type === 'Command' && node.name && node.name.text) {
        analysisReport.detectedBinaries.push(node.name.text);
      }
      if (node.type === 'Pipeline' || node.type === 'CommandSubstitution') {
        analysisReport.hasDestructiveOperators = true;
      }
      if (node.type === 'Redirect') {
        analysisReport.hasFileRedirects = true;
      }
      if (node.commands) node.commands.forEach(inspectNode);
      if (node.next) inspectNode(node.next);
      if (node.body) {
        if (Array.isArray(node.body)) node.body.forEach(inspectNode);
        else inspectNode(node.body);
      }
    };

    if (ast && ast.commands) {
      ast.commands.forEach(inspectNode);
    }

    for (const bin of analysisReport.detectedBinaries) {
      if (BANNED_BINARIES.includes(bin)) {
        analysisReport.isSafe = false;
        analysisReport.reason = `Security Governance Violation: Use of binary tracking item '${bin}' is strictly banned.`;
        return analysisReport;
      }
    }

    return analysisReport;
  } catch (err) {
    return {
      isSafe: false,
      reason: "Syntax Interpretation Rejection: Failed to construct clean command syntax map tree."
    };
  }
}

/**
 * Stage 3: Guarded Shell Executor Step
 */
function executeGuardedBash(commandStr, targetWorkspace) {
  const sandboxPath = path.resolve(targetWorkspace);
  const isWindows = os.platform() === 'win32';
  const customBinPath = path.resolve('./bin');

  let execOptions = {
    cwd: sandboxPath,
    encoding: 'utf-8',
    timeout: 45000,
    env: {
      ...process.env,
      PATH: `${customBinPath}${isWindows ? ';' : ':'}${process.env.PATH}`
    }
  };

  if (isWindows) {
    execOptions.shell = 'C:\\Program Files\\Git\\bin\\bash.exe'; 
    if (!fs.existsSync(execOptions.shell)) {
      execOptions.shell = 'bash.exe'; 
    }
  }

  try {
    const stdout = execSync(commandStr, execOptions);
    return stdout || "💡 [Execution structural return: Command verified and returned with no standard output trace]";
  } catch (err) {
    return `❌ Terminal Execution Exception (Exit Code: ${err.status}):\n${err.stdout || ''}\n${err.stderr || ''}`;
  }
}

/**
 * Main turn pipeline processing
 */
export async function processAgentTurn(llmRawOutputBlock) {
  const incomingTokens = Math.ceil(llmRawOutputBlock.length / 4);
  config.estimatedRollingTokens += incomingTokens;

  const bashBlockRegex = /```bash\n([\s\S]*?)\n```/;
  const match = llmRawOutputBlock.match(bashBlockRegex);

  const remainingTokens = config.MAX_CONTEXT_TOKENS - config.estimatedRollingTokens;
  const consumptionPercentage = ((config.estimatedRollingTokens / config.MAX_CONTEXT_TOKENS) * 100).toFixed(1);
  const telemetryHeader = `\n================================================================================\n⚙️ SYSTEM CONTEXT TELEMETRY LOG:\n[Session Consumption: ${config.estimatedRollingTokens} tokens] [Remaining Budget: ${remainingTokens} tokens] [Context Used: ${consumptionPercentage}%]\n================================================================================\n`;

  if (!match) {
    return {
      requiresResponse: false,
      systemFeedback: `🤖 Conversational response processed safely.${telemetryHeader}`
    };
  }

  const extractedCommand = match[1].trim();
  console.log("\n------------------------------------------------------------");
  console.log(`🧱 CONSTRUCTED COMMAND TARGET:\n${extractedCommand}`);

  const report = analyzeCommandStructure(extractedCommand);
  console.log(`🔍 RISK REPORT: ${JSON.stringify(report, null, 2)}`);

  if (!report.isSafe) {
    return {
      requiresResponse: true,
      systemFeedback: `❌ TERMINATED BY ENVIRONMENT SECURITY FILTER:\n${report.reason}${telemetryHeader}`
    };
  }

  if (report.hasFileRedirects || report.hasDestructiveOperators || report.detectedBinaries.includes('agent-patch')) {
    console.log("\n⚠️  CRITICAL OPERATION BARRIER INITIATED.");
    const decision = await askHuman("Authorize this constructor action execution block? (y/n): ");
    if (decision.toLowerCase() !== 'y') {
      return {
        requiresResponse: true,
        systemFeedback: `⛔ Action explicitly rejected by workspace owner. Execution halted.${telemetryHeader}`
      };
    }
  }

  console.log("\n⚡ Dispatching command down to workspace execution runtime...");
  const executionOutput = executeGuardedBash(extractedCommand, "./workspace");
  
  const outputTokens = Math.ceil(executionOutput.length / 4);
  config.estimatedRollingTokens += outputTokens;

  const postRemaining = config.MAX_CONTEXT_TOKENS - config.estimatedRollingTokens;
  const postPercentage = ((config.estimatedRollingTokens / config.MAX_CONTEXT_TOKENS) * 100).toFixed(1);
  const updatedTelemetry = `\n================================================================================\n⚙️ SYSTEM CONTEXT TELEMETRY LOG:\n[Session Consumption: ${config.estimatedRollingTokens} tokens] [Remaining Budget: ${postRemaining} tokens] [Context Used: ${postPercentage}%]\n================================================================================\n`;

  return {
    requiresResponse: true,
    systemFeedback: `📥 TERMINAL STDOUT FEEDBACK LOG COLLECTED:\n${executionOutput}${updatedTelemetry}`
  };
}