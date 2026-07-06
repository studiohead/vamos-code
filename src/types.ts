// src/types.ts
export interface AgentModule {
    runAutonomousAgentSession: (input: string) => Promise<string>;
}

export interface JiraTicketPayload {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string;
  projectKey: string;
  comments: string[];
}

export interface DocumentChunk {
  text: string;
  metadata: {
    issueKey: string;
    projectKey: string;
    status: string;
    assignee: string;
    type: 'core_intent' | 'historical_dialogue';
  };
}