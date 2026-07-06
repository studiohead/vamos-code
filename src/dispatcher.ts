import { AgentModule, JiraTicketPayload } from './types.js';

/**
 * Dispatches a task to the 'code' conversational agent (the only agent that
 * runs an actual multi-turn LLM loop against the sandbox). Jira is handled
 * separately below — see runJiraQuery — because JiraAgent is a data-fetch
 * tool, not a conversational agent, and forcing it through the same
 * `runAutonomousAgentSession` contract (as the previous version did) meant
 * every `@jira` command threw immediately, since jira-agent.ts never
 * exported that function.
 */
export async function dispatchTask(
  task: string,
  agentType: 'code' | 'jira',
  systemIntelligence: string
): Promise<string> {
  if (agentType === 'jira') {
    return await runJiraQuery(task);
  }

  const agentModule = (await import('./agents/code-agent.js')) as AgentModule;

  if (typeof agentModule.runAutonomousAgentSession !== 'function') {
    throw new Error('Agent module at ./agents/code-agent.js does not implement runAutonomousAgentSession');
  }

  return await agentModule.runAutonomousAgentSession(
    `<system_intelligence>\n${systemIntelligence}\n</system_intelligence>\n\n${task}`
  );
}

/**
 * Extracts a Jira issue key (e.g. CLN-1234) from free text.
 */
export function extractJiraKey(text: string): string | null {
  const match = text.match(/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/);
  return match ? match[0] : null;
}

function looksLikeJql(input: string): boolean {
  return /(=|~|!=| in \(| AND | OR |ORDER BY)/i.test(input);
}

/**
 * Runs a Jira query directly (no LLM round-trip needed for a data fetch)
 * and returns a human-readable summary. Accepts either a raw JQL string,
 * free text that will be turned into a summary/description text search, or
 * a single ticket key.
 */
async function runJiraQuery(task: string): Promise<string> {
  const trimmedTask = task.trim();
  const { JiraAgent } = await import('./agents/jira-agent.js');

  let jiraAgent;
  try {
    jiraAgent = new JiraAgent();
  } catch (err: any) {
    const msg = `❌ Jira Configuration Error: ${err.message}`;
    console.error(msg);
    return msg;
  }

  const directKey = extractJiraKey(trimmedTask);
  let jql: string;
  if (directKey && trimmedTask === directKey) {
    jql = `key = ${directKey}`;
  } else if (looksLikeJql(trimmedTask)) {
    jql = trimmedTask;
  } else {
    jql = `text ~ "${trimmedTask.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
  }

  console.log(`🔎 Running Jira query: ${jql}`);
  const tickets = await jiraAgent.searchJql(jql);

  if (tickets.length === 0) {
    const msg = `💡 No Jira tickets found matching: ${trimmedTask}`;
    console.log(msg);
    return msg;
  }

  const formatted = tickets
    .map((t) => `• [${t.key}] ${t.summary} — ${t.status}, assignee: ${t.assignee}`)
    .join('\n');
  console.log(formatted);
  return formatted;
}

function buildPlaywrightEnrichedPrompt(ticket: JiraTicketPayload, userInput: string): string {
  const commentBlock =
    ticket.comments.length > 0
      ? `\nRecent comments:\n${ticket.comments.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

  return `
Context pulled from Jira ticket ${ticket.key} (project ${ticket.projectKey}, status: ${ticket.status}, assignee: ${ticket.assignee}):

Summary: ${ticket.summary}
Description:
${ticket.description || '(no description provided)'}
${commentBlock}

User request: ${userInput}

Task instructions:
- Use the ticket context above as the acceptance criteria / source of truth for what to test.
- If Playwright is not yet configured in the workspace (no playwright.config.ts and no @playwright/test dependency in package.json), initialize it first.
- Create a new Playwright test file under a tests/ (or existing test) directory, named after the ticket key (e.g. tests/${ticket.key}.spec.ts), implementing test case(s) that verify the behavior described in the ticket.
- Prefer resilient, accessible locators (getByRole/getByLabel/getByText) over brittle CSS selectors.
- After writing the test, attempt to run it. If Playwright browsers aren't installed and can't be installed in this sandbox, say so plainly rather than guessing at output.
`.trim();
}

/**
 * Detects a Jira ticket reference in free-form user input (e.g. "Use Jira
 * ticket CLN-1234 to create a new playwright test"), fetches the ticket,
 * and — if found — forwards an enriched prompt to the code agent so it has
 * real acceptance-criteria context instead of just the raw ticket key.
 *
 * Returns { handled: false } whenever no ticket key is present, Jira isn't
 * configured, or the ticket can't be found, so the caller can fall back to
 * dispatching the user's original input unmodified.
 */
export async function handleCrossAgentPrompt(
  userInput: string,
  systemIntelligence: string
): Promise<{ handled: boolean; result?: string }> {
  const jiraKey = extractJiraKey(userInput);
  if (!jiraKey) return { handled: false };

  console.log(`🔗 Detected Jira ticket reference: ${jiraKey}`);

  const { JiraAgent } = await import('./agents/jira-agent.js');
  let jiraAgent;
  try {
    jiraAgent = new JiraAgent();
  } catch (err: any) {
    console.warn(`⚠️ Jira integration not configured (${err.message}). Proceeding without ticket context.`);
    return { handled: false };
  }

  const matches = await jiraAgent.searchJql(`key = ${jiraKey}`, 1);
  const ticket = matches[0];
  if (!ticket) {
    console.warn(`⚠️ Could not find Jira ticket ${jiraKey}. Proceeding without ticket context.`);
    return { handled: false };
  }

  console.log(`📄 Loaded ticket ${ticket.key}: "${ticket.summary}" (${ticket.status})`);

  const enrichedPrompt = buildPlaywrightEnrichedPrompt(ticket, userInput);
  const result = await dispatchTask(enrichedPrompt, 'code', systemIntelligence);
  return { handled: true, result };
}
