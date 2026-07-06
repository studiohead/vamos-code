import * as vscode from 'vscode';
// Import your logic from your index.ts (or core/agent.ts)
// Note: Ensure your core logic is exported properly from your project
import { processAgentTurn, initializeEnvironment } from '../src/index.js'; 

export function activate(context: vscode.ExtensionContext) {
    // 1. Initialize environment context (Jira keys, etc.)
    initializeEnvironment();

    // 2. Define the Chat Participant (@VAMOS)
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        stream.progress('VAMOS is thinking...');

        // 3. Bridge the Chat UI to your existing logic
        // We pass the user prompt into your established processing pipeline
        const result = await processAgentTurn(request.prompt);

        // 4. Stream the system feedback back to the VS Code Chat panel
        stream.markdown(result.systemFeedback);
    };

    const participant = vscode.chat.createChatParticipant('VAMOS.chat', handler);
    
    // Add custom icon/description
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'VAMOS-icon.png');
    
    context.subscriptions.push(participant);
}