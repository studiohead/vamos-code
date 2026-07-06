import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import * as fs from 'fs';
import * as path from 'path';
import { 
  processAgentTurn, 
  initializeEnvironment,
  closeTerminalInterface,
  config
} from './index.js';

// 1. Explicitly initialize environment configurations BEFORE running setup checks
initializeEnvironment();

if (!config.AWS_BEDROCK_API_KEY) {
  console.error("❌ Critical Blocker: AWS_BEDROCK_API_KEY is missing from your configuration .env file.");
  process.exit(1);
}

// 2. Set the official environment token fallback variable that the AWS SDK looks for
process.env.AWS_BEARER_TOKEN_BEDROCK = config.AWS_BEDROCK_API_KEY;

// 3. Initialize the official AWS Bedrock Runtime Client
const bedrockClient = new BedrockRuntimeClient({
  region: config.AWS_REGION
});

/**
 * AUTONOMOUS AGENT ORCHESTRATION LOOP
 */
async function runAutonomousAgentSession(userTaskObjective) {
  console.clear();
  console.log(`🚀 Starting Autonomous Agent Session via AWS Bedrock [${config.AWS_REGION}] Loop...`);
  
  const conventionsPath = path.resolve('./config/CONVENTIONS.md');
  let engineeringSystemInstructions = "You are an autonomous senior developer agent system.";
  if (fs.existsSync(conventionsPath)) {
    engineeringSystemInstructions = fs.readFileSync(conventionsPath, 'utf-8');
  }

  // Bedrock Messages API structure requires content arrays
  const conversationHistory = [
    { role: 'user', content: [{ text: `Task Objective: ${userTaskObjective}` }] }
  ];

  let loopActive = true;
  let executionRound = 1;

  // We point to Claude 3.5 Sonnet on Bedrock for modern multi-turn agent execution
  const bedrockModelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

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

      const rawResponse = await bedrockClient.send(command);
      const decodedResponseBody = new TextDecoder('utf-8').decode(rawResponse.body);
      const jsonResponse = JSON.parse(decodedResponseBody);

      const claudeTextResponse = jsonResponse.content[0].text;
      console.log(`\n💬 AGENT RESPONSE:\n${claudeTextResponse}`);

      // Save Claude's thoughts into the history context window
      conversationHistory.push({ role: 'assistant', content: [{ text: claudeTextResponse }] });

      // Run the code blocks securely through your index.js sandbox execution layer
      const evaluationResult = await processAgentTurn(claudeTextResponse);
      console.log(evaluationResult.systemFeedback);

      if (!evaluationResult.requiresResponse) {
        console.log("✅ Task concluded. The model returned conversational completion text.");
        loopActive = false;
      } else {
        // Feed execution tracking logs back to Bedrock history payload array
        conversationHistory.push({ role: 'user', content: [{ text: evaluationResult.systemFeedback }] });
        executionRound++;
      }

      if (config.estimatedRollingTokens >= config.MAX_CONTEXT_TOKENS) {
        console.log("⚠️ Emergency Exit: Context window allocation budget completely exhausted.");
        loopActive = false;
      }

    } catch (apiError) {
      console.error(`❌ AWS Bedrock Transaction Exception: ${apiError.message}`);
      loopActive = false;
    }
  }

  closeTerminalInterface();
}

// ================================================================================
// EXECUTION TRIGGER ENTRYPOINT
// ================================================================================
const initialObjective = "Examine the files inside workspace, view the directory tree structure, and update index.js to print an advanced corporate banner greeting.";
await runAutonomousAgentSession(initialObjective);