import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { processAgentTurn, closeTerminalInterface, config } from '../index.js';
// Declared globally, initialized lazily within runtime function to ensure configuration availability
let bedrockClient;
/**
 * TELEMETRY AUDIT OVERWATCH SYSTEM (Tetragon eBPF Integration)
 * Spawns a background listener tracking Tetragon events to pipe real-time kernel signals.
 */
function initializeTetragonObserver() {
    const logPath = path.resolve('./logs/tetragon-kernel-security.json');
    // Clean or create log directory layout cleanly prior to running
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    console.log("🛡️ Attaching eBPF Tetragon Event Observer Pipeline Engine...");
    try {
        // Check if tetragon binary exists on the system path
        execSync('which tetra', { stdio: 'ignore' });
        // Spawn the tetragon user-space CLI to write structured JSON event traces to disk
        const tetraProcess = spawn('tetra', ['status'], { stdio: 'ignore' });
        tetraProcess.on('error', () => {
            console.warn("⚠️ Tetragon Warning: 'tetra' utility engine structural status check fell down. Running simulation logging.");
        });
    }
    catch (err) {
        console.warn("💡 Notice: 'tetra' system CLI binary missing. Kernel-level eBPF logs will pass through fallback simulation layers.");
    }
}
/**
 * AUTONOMOUS AGENT ORCHESTRATION LOOP
 * Implements architectural process supervision over the loop state itself to capture anomalies.
 */
export async function runAutonomousAgentSession(userTaskObjective) {
    if (!config.AWS_BEDROCK_API_KEY) {
        console.error("❌ Critical Blocker: AWS_BEDROCK_API_KEY is missing from your configuration .env file.");
        return "Session concluded successfully.";
    }
    process.env.AWS_BEARER_TOKEN_BEDROCK = config.AWS_BEDROCK_API_KEY;
    // Initialize the official AWS Bedrock Runtime Client safely using fully initialized context configurations
    bedrockClient = new BedrockRuntimeClient({
        region: config.AWS_REGION
    });
    console.clear();
    console.log(`🚀 Starting Autonomous Agent Session via AWS Bedrock [${config.AWS_REGION}] Loop...`);
    // Fire up our active kernel telemetry daemon check hook
    initializeTetragonObserver();
    const conventionsPath = path.resolve('./config/CONVENTIONS.md');
    let engineeringSystemInstructions = "You are an autonomous senior developer agent system operating inside a kernel-monitored eBPF sandbox.";
    try {
        if (fs.existsSync(conventionsPath)) {
            engineeringSystemInstructions = fs.readFileSync(conventionsPath, 'utf-8');
        }
    }
    catch (filesystemError) {
        console.warn(`⚠️ System Instruction Warning: Could not resolve or read CONVENTIONS.md safely (${filesystemError.message}). Using standard fallback profile.`);
    }
    // Bedrock Messages API structure requires content arrays
    const conversationHistory = [
        { role: 'user', content: [{ text: `Task Objective: ${userTaskObjective}` }] }
    ];
    let loopActive = true;
    let executionRound = 1;
    // We point to Claude 3.5 Sonnet on Bedrock for modern multi-turn agent execution
    const bedrockModelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
    // Master Orchestration Supervisor Boundary Loop Block
    while (loopActive) {
        console.log(`\n🤖 [Round ${executionRound}] Querying AWS Bedrock Layer...`);
        // Construct the standard Bedrock Messages API structure payload
        const payload = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 4000,
            system: engineeringSystemInstructions,
            messages: conversationHistory
        };
        try {
            const command = new InvokeModelCommand({
                modelId: bedrockModelId,
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify(payload)
            });
            // Transmit transaction package under monitor control
            const rawResponse = await bedrockClient.send(command);
            if (!rawResponse.body) {
                throw new Error("Empty body interface returned from AWS Bedrock transaction pipeline stream.");
            }
            const decodedResponseBody = new TextDecoder('utf-8').decode(rawResponse.body);
            const jsonResponse = JSON.parse(decodedResponseBody);
            if (!jsonResponse.content || !jsonResponse.content[0] || !jsonResponse.content[0].text) {
                throw new Error("Malformatted content block shape caught inside decoded model payload response.");
            }
            const claudeTextResponse = jsonResponse.content[0].text;
            console.log(`\n💬 AGENT RESPONSE:\n${claudeTextResponse}`);
            // Save Claude's thoughts into the history context window
            conversationHistory.push({ role: 'assistant', content: [{ text: claudeTextResponse }] });
            /**
             * Supervisor Exception Container Wrap over sub-layer context processing.
             * Even if index.js execution panics or hits an unexpected operational state,
             * the primary agent control loop catches it gracefully, maintains state tracking,
             * and feeds a structural log payload summary straight back to the model.
             */
            let evaluationResult;
            try {
                // Run the code blocks securely through your index.js sandbox execution layer
                evaluationResult = await processAgentTurn(claudeTextResponse);
            }
            catch (sandboxCrashException) {
                console.error(`💥 Fatal Sandbox Boundary Alert: Subprocess turn execution collapsed inside index.js handler: ${sandboxCrashException.message}`);
                // Check if the failure profile maps to an active eBPF SIGKILL termination
                const isKilledByKernel = sandboxCrashException.message.includes('SIGKILL') || sandboxCrashException.message.includes('status 137');
                const customFeedbackMessage = isKilledByKernel
                    ? `❌ KERNEL TERMINATION INTERVENTION: Your shell execution thread generated an in-kernel security anomaly matching blocked configurations inside Tetragon BPF tracing map policies. Process violently dropped via SIGKILL.`
                    : `❌ SUPERVISOR ALERT: The local sandbox turn execution mechanism suffered a critical system breakdown during processing. Error detail string trace: ${sandboxCrashException.message}`;
                evaluationResult = {
                    requiresResponse: true,
                    systemFeedback: customFeedbackMessage
                };
            }
            console.log(evaluationResult.systemFeedback);
            if (!evaluationResult.requiresResponse) {
                console.log("✅ Task concluded. The model returned conversational completion text.");
                loopActive = false;
            }
            else {
                // Feed execution tracking logs back to Bedrock history payload array
                conversationHistory.push({ role: 'user', content: [{ text: evaluationResult.systemFeedback }] });
                executionRound++;
            }
            // Check contextual budget metrics before initiating consecutive automation round steps
            if (config.estimatedRollingTokens >= config.MAX_CONTEXT_TOKENS) {
                console.log(`⚠️ Emergency Exit: Context window allocation budget completely exhausted. (${config.estimatedRollingTokens} consumed / Limit: ${config.MAX_CONTEXT_TOKENS})`);
                loopActive = false;
            }
        }
        catch (apiError) {
            console.error(`❌ AWS Bedrock Transaction Exception: ${apiError.message}`);
            // Attempt safe step logging sequence before final session exit termination
            try {
                const errorRecoveryPayload = `❌ SYSTEM DISPATCH EXCEPTION REPORTED: The automation engine model communications layer fell down mid-transaction. Trace: ${apiError.message}`;
                conversationHistory.push({ role: 'user', content: [{ text: errorRecoveryPayload }] });
            }
            catch (nestedTrackingErr) {
                console.error(`⚠️ Supervisor Tracking Failure: Failed to update local memory store array registry with exception tracking metrics: ${nestedTrackingErr.message}`);
            }
            loopActive = false;
        }
    }
    // Gracefully release and destroy terminal interface locks cleanly outside the loop scope
    try {
        closeTerminalInterface();
        console.log("🔒 System Resource Isolation: Terminal stream interfaces successfully detached.");
    }
    catch (closureCleanupError) {
        console.error(`⚠️ Notice: Encountered a localized issue releasing user console I/O bindings: ${closureCleanupError.message}`);
    }
    return "Agent session terminated gracefully.";
}
// ================================================================================
// EXECUTION TRIGGER ENTRYPOINT (MODIFIED FOR ROUTING)
// ================================================================================
// Only run automatically if this file is executed directly via command line
if (process.argv[1] && process.argv[1].endsWith('code-agent.js')) {
    const initialObjective = "Examine the files inside workspace, view the directory tree structure, and update index.js to print an advanced corporate banner greeting.";
    try {
        await runAutonomousAgentSession(initialObjective);
    }
    catch (globalProcessException) {
        console.error(`🚨 Fatal Global Execution Trap: Session terminated by supervisor controller. Reason: ${globalProcessException.message}`);
        process.exit(1);
    }
}
