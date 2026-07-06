import { execSync } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { analyzeCommand } from './security.js';
export const config = {
    MAX_CONTEXT_TOKENS: 1000000,
    estimatedRollingTokens: 0,
    AWS_BEDROCK_API_KEY: '',
    AWS_REGION: 'us-east-1',
    JIRA_SERVER_URL: '',
    JIRA_USER_EMAIL: '',
    JIRA_API_TOKEN: ''
};
let rl = null;
// --- Initialization & Environment ---
// Dependency Check (Runs immediately on startup)
function checkSystemDependencies() {
    try {
        execSync('command -v tetra', { stdio: 'ignore' });
    }
    catch (e) {
        console.warn("💡 Notice: 'tetra' system CLI binary missing. Kernel-level eBPF logs will pass through fallback simulation layers.");
    }
}
checkSystemDependencies();
export function initializeEnvironment() {
    try {
        const envPath = path.resolve('./.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const lines = envContent.split(/\r?\n/);
            for (const line of lines) {
                if (!line || line.trim().startsWith('#'))
                    continue;
                const [key, ...valueParts] = line.split('=');
                if (key) {
                    const rawValue = valueParts.join('=').trim();
                    const sanitizedValue = rawValue.replace(/^["']|["']$/g, '');
                    const trimmedKey = key.trim();
                    if (trimmedKey === 'MAX_CONTEXT_TOKENS') {
                        const parsedLimit = parseInt(sanitizedValue, 10);
                        if (!isNaN(parsedLimit))
                            config.MAX_CONTEXT_TOKENS = parsedLimit;
                    }
                    if (trimmedKey === 'AWS_BEDROCK_API_KEY') {
                        config.AWS_BEDROCK_API_KEY = sanitizedValue;
                    }
                    if (trimmedKey === 'AWS_REGION') {
                        config.AWS_REGION = sanitizedValue;
                    }
                    if (trimmedKey === 'JIRA_SERVER_URL') {
                        config.JIRA_SERVER_URL = sanitizedValue;
                    }
                    if (trimmedKey === 'JIRA_USER_EMAIL') {
                        config.JIRA_USER_EMAIL = sanitizedValue;
                    }
                    if (trimmedKey === 'JIRA_API_TOKEN') {
                        config.JIRA_API_TOKEN = sanitizedValue;
                    }
                }
            }
        }
    }
    catch (err) {
        console.warn(`⚠️ Warning: Failed to read .env file (${err.message}). Using defaults.`);
    }
    if (!fs.existsSync('./workspace'))
        fs.mkdirSync('./workspace');
    return config;
}
export function ensureTerminalInterface() {
    if (!rl) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return rl;
}
export const askHuman = (query) => {
    const activeInterface = ensureTerminalInterface();
    return new Promise((resolve) => activeInterface.question(query, resolve));
};
export function closeTerminalInterface() {
    if (rl) {
        rl.close();
        rl = null;
    }
}
// --- Guarded Execution Engine ---
function executeGuardedBash(commandStr, targetWorkspace) {
    const resolvedBaseWorkspace = path.resolve(targetWorkspace);
    // Compiled tool binaries (agent-patch, view-tree, rg-search, grep-context)
    // are emitted to dist/bin (see tsconfig.json outDir + bin/**/* include).
    // This previously pointed at a root-level ./bin that never existed, so
    // every one of those commands silently failed with "command not found"
    // no matter what the agent tried to run.
    const customBinPath = path.resolve('./dist/bin');
    const isWindows = os.platform() === 'win32';
    const isolatedEnv = {
        PATH: `${customBinPath}${isWindows ? ';' : ':'}/usr/bin:/bin:/usr/sbin:/sbin`,
        TZ: 'UTC',
        LANG: 'en_US.UTF-8',
        HOME: resolvedBaseWorkspace
    };
    const execOptions = {
        cwd: resolvedBaseWorkspace,
        encoding: 'utf-8',
        timeout: 45000,
        env: isolatedEnv
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
    }
    catch (err) {
        if (err.signal === 'SIGKILL' || err.status === 137) {
            throw new Error(`SIGKILL: Process violently terminated with status 137 by kernel policy.`);
        }
        return `❌ Terminal Execution Exception (Exit Code: ${err.status}):\n${err.stdout || ''}\n${err.stderr || ''}`;
    }
}
// --- Multi-Agent Dispatcher ---
//
// NOTE: dispatchTask used to be (re)defined here, pointing at './jira-agent.js'
// and './code-agent.js' — but those files live at './agents/jira-agent.ts' and
// './agents/code-agent.ts'. That path mismatch meant every dispatch call threw
// a module-not-found error at runtime, regardless of agent type. The single
// source of truth for dispatch now lives in dispatcher.ts, which also fixes
// the '@jira' path (previously required jira-agent.ts to implement
// runAutonomousAgentSession, which it never did) and adds automatic
// Jira-ticket-key detection so prompts like "Use Jira ticket CLN-1234 to
// create a new playwright test" pull real ticket context in before dispatch.
import { dispatchTask, handleCrossAgentPrompt } from './dispatcher.js';
export { dispatchTask, handleCrossAgentPrompt };
// --- Agent Turn Logic ---
export async function processAgentTurn(llmRawOutputBlock) {
    const incomingTokens = Math.ceil(llmRawOutputBlock.length / 4);
    config.estimatedRollingTokens += incomingTokens;
    const bashBlockRegex = /```bash\s*[\r\n]+([\s\S]*?)```/;
    const jsonBlockRegex = /```json\s*[\r\n]+([\s\S]*?)```/;
    const bashMatch = llmRawOutputBlock.match(bashBlockRegex);
    const jsonMatch = llmRawOutputBlock.match(jsonBlockRegex);
    const remainingTokens = config.MAX_CONTEXT_TOKENS - config.estimatedRollingTokens;
    const consumptionPercentage = ((config.estimatedRollingTokens / config.MAX_CONTEXT_TOKENS) * 100).toFixed(1);
    const telemetryHeader = `\n================================================================================\n⚙️ SYSTEM CONTEXT TELEMETRY LOG:\n[Session Consumption: ${config.estimatedRollingTokens} tokens] [Remaining Budget: ${remainingTokens} tokens] [Context Used: ${consumptionPercentage}%]\n================================================================================\n`;
    if (jsonMatch) {
        const rawJsonStr = jsonMatch[1].trim();
        console.log("\n------------------------------------------------------------");
        console.log("📥 ISOLATED STRUCTURAL JSON DATA BLOCK RECOVERED");
        try {
            const parsedPayload = JSON.parse(rawJsonStr);
            return {
                requiresResponse: true,
                systemFeedback: `📥 SYSTEM OBJECT VALIDATION: Successfully parsed structural data token stream cleanly.\nData Payload: ${JSON.stringify(parsedPayload, null, 2)}${telemetryHeader}`
            };
        }
        catch (jsonFault) {
            return {
                requiresResponse: true,
                systemFeedback: `❌ System Data Validation Fault: Extracted JSON block fails structural schema validation rules.\nParser error details: ${jsonFault.message}${telemetryHeader}`
            };
        }
    }
    if (bashMatch) {
        const extractedCommand = bashMatch[1].trim();
        console.log("\n------------------------------------------------------------");
        console.log(`🧱 CONSTRUCTED COMMAND TARGET:\n${extractedCommand}`);
        const riskReport = analyzeCommand(extractedCommand);
        if (!riskReport.isSafe) {
            console.log(`\n❌ BLOCKED BY SECURITY FILTER: ${riskReport.reason}`);
            return {
                requiresResponse: true,
                systemFeedback: `❌ BLOCKED BY SECURITY FILTER:\n${riskReport.reason}${telemetryHeader}`
            };
        }
        if (riskReport.requiresConfirmation) {
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
        let executionOutput;
        try {
            executionOutput = executeGuardedBash(extractedCommand, "./workspace");
        }
        catch (supervisorException) {
            if (supervisorException.message.includes('SIGKILL')) {
                throw supervisorException;
            }
            executionOutput = `❌ Supervisor Intervention: Clean containment step applied to catch uncaught exception context or runaway runtime panics: ${supervisorException.message}`;
        }
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
    return {
        requiresResponse: false,
        systemFeedback: `🤖 Conversational response processed safely.${telemetryHeader}`
    };
}
// --- Main Runtime Loop ---
async function main(env) {
    const intelligenceFileName = `VAMOS-${env.toUpperCase()}.md`;
    const VAMOSPath = path.resolve(`./${intelligenceFileName}`);
    let systemIntelligence = "You are a professional software engineer.";
    if (fs.existsSync(VAMOSPath)) {
        systemIntelligence = fs.readFileSync(VAMOSPath, 'utf-8');
        console.log(`📡 VAMOS Identity Loaded: ${intelligenceFileName}`);
    }
    else {
        console.warn(`⚠️ Warning: ${intelligenceFileName} not found. Using default identity.`);
    }
    const activeConfig = initializeEnvironment();
    ensureTerminalInterface();
    console.log("======================================================================");
    console.log("🛡️  VAMOS ZERO-TRUST SECURE AGENT TERMINAL RUNTIME ACTIVATED");
    console.log(`📡 Target Cluster Workspace: ${path.resolve('./workspace')}`);
    console.log(`🔑 Secure Environment Context Loaded: [Jira Host: ${activeConfig.JIRA_SERVER_URL || 'None'}]`);
    console.log(`🛠️  Mode: ${env.toUpperCase()}`);
    console.log("======================================================================");
    console.log("🤖 System standing by. Enter an autonomous task objective for your agent...");
    while (true) {
        try {
            const agentRawInput = await askHuman(`\nVAMOS [${env.toUpperCase()}] > `);
            const trimmedInput = agentRawInput.trim();
            if (trimmedInput.toLowerCase() === 'exit') {
                console.log("👋 Shutting down secure context terminal sandbox gracefully...");
                break;
            }
            if (!trimmedInput)
                continue;
            // 🚀 SLASH COMMAND INTERCEPTOR
            if (trimmedInput.startsWith('/')) {
                const parts = trimmedInput.split(' ');
                const commandName = parts[0].substring(1).toLowerCase();
                const additionalUserText = parts.slice(1).join(' ');
                if (commandName === 'clear') {
                    console.clear();
                    console.log("🧹 Terminal interface wiped cleanly.");
                    continue;
                }
                if (commandName === 'help') {
                    console.log(`\n💡 Available Local Commands:`);
                    console.log(`• /help    - Shows this command menu`);
                    console.log(`• /clear   - Clears the active console panel`);
                    console.log(`• /index   - Maps workspace layout, manifests, and README docs dynamically`);
                    console.log(`• /skinny  - Prunes context and distills session into a digest file`);
                    console.log(`• /[file]  - Loads a template string out of your local ./commands/ folder`);
                    continue;
                }
                if (commandName === 'index' || commandName === 'scan') {
                    console.log("🔍 Scanning workspace to compile repository map...");
                    let dirTree = "";
                    try {
                        dirTree = execSync('node ./dist/bin/view-tree.js', { encoding: 'utf-8' });
                    }
                    catch (treeErr) {
                        dirTree = `⚠️ Local tree mapping utility execution failed: ${treeErr.message}`;
                    }
                    const workspacePath = path.resolve('./workspace');
                    const packageJsonContent = fs.existsSync(path.join(workspacePath, 'package.json'))
                        ? fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8') : "No package.json found.";
                    const readmeContent = fs.existsSync(path.join(workspacePath, 'README.md'))
                        ? fs.readFileSync(path.join(workspacePath, 'README.md'), 'utf-8') : "No README.md found.";
                    const digestPath = path.resolve(`./workspace/session_digest-${env}.md`);
                    const digestContent = fs.existsSync(digestPath) ? fs.readFileSync(digestPath, 'utf-8') : "No active session digest found.";
                    const completeRepositoryMap = `
<system_intelligence>\n${systemIntelligence}\n</system_intelligence>\n\n=== 0. SESSION DIGEST ===\n${digestContent}\n\n=== 1. REPOSITORY DIRECTORY HIERARCHY ===\n${dirTree}\n\n=== 2. PROJECT MANIFEST (package.json) ===\n${packageJsonContent}\n\n=== 3. ROOT DOCUMENTATION (README.md) ===\n${readmeContent}`;
                    console.log("🚀 Codebase mapping assembled. Transmitting to VAMOS Agent...");
                    await dispatchTask(completeRepositoryMap, 'code', systemIntelligence);
                    continue;
                }
                if (commandName === 'skinny') {
                    console.log("✂️ Pruning context to lean status...");
                    const skinnyPrompt = `Generate a "skinny" distilled summary of our current session. - Distill the current state into a high-density reference. - Prune all non-essential chatter and redundant logs. - Retain only the architectural decisions, active constraints, and the most critical next-step TODOs. - Output the result in clean, concise Markdown.`;
                    const digestContent = await dispatchTask(skinnyPrompt, 'code', systemIntelligence);
                    const digestPath = path.resolve(`./workspace/session_digest-${env}.md`);
                    fs.writeFileSync(digestPath, digestContent, 'utf-8');
                    console.log(`✅ Digest successfully saved to: ${digestPath}`);
                    continue;
                }
                const commandFilePath = path.resolve(`./commands/${commandName}.txt`);
                if (fs.existsSync(commandFilePath)) {
                    const templatePrompt = fs.readFileSync(commandFilePath, 'utf-8');
                    const combinedPrompt = additionalUserText ? `${templatePrompt}\n\nUser Context:\n${additionalUserText}` : templatePrompt;
                    await dispatchTask(combinedPrompt, 'code', systemIntelligence);
                }
                else {
                    console.log(`❌ No command found: commands/${commandName}.txt`);
                }
                console.log("\n======================================================================");
                console.log("✅ Session Complete. Standing by...");
                console.log("======================================================================");
                continue;
            }
            // 5. Standard Request Path (Multi-Agent Routing)
            let targetAgent = 'code';
            let cleanInput = trimmedInput;
            if (trimmedInput.startsWith('@jira')) {
                targetAgent = 'jira';
                cleanInput = trimmedInput.replace('@jira', '').trim();
            }
            else if (trimmedInput.startsWith('@code')) {
                cleanInput = trimmedInput.replace('@code', '').trim();
            }
            console.log(`\nDispatching objective to VAMOS ${targetAgent.toUpperCase()} Agent (${env.toUpperCase()} context)...`);
            // If this is headed to the code agent and mentions a Jira ticket key
            // (e.g. "Use Jira ticket CLN-1234 to create a new playwright test"),
            // pull the real ticket summary/description/comments in first so the
            // agent has actual acceptance criteria instead of just a bare key.
            // Falls through to a normal dispatch if Jira isn't configured, the
            // ticket can't be found, or no key is present.
            let crossAgentHandled = false;
            if (targetAgent === 'code') {
                const crossAgentResult = await handleCrossAgentPrompt(cleanInput, systemIntelligence);
                crossAgentHandled = crossAgentResult.handled;
            }
            if (!crossAgentHandled) {
                await dispatchTask(cleanInput, targetAgent, systemIntelligence);
            }
            console.log("\n======================================================================");
            console.log("✅ Session Complete. Standing by...");
            console.log("======================================================================");
        }
        catch (loopError) {
            console.error(`\n❌ Pipeline Exception: ${loopError.message}`);
        }
    }
    closeTerminalInterface();
}
const args = process.argv.slice(2);
const environment = args[0]?.toLowerCase() || 'dev';
if (environment !== 'dev' && environment !== 'qa') {
    console.log("Usage: node dist/index.js [dev|qa]");
    process.exit(1);
}
main(environment).catch((fatalErr) => {
    console.error(`🚨 Fatal Runtime Initialization Boot Collapse: ${fatalErr.message}`);
    closeTerminalInterface();
    process.exit(1);
});
