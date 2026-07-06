import { Version2Client } from 'jira.js';
import * as dotenv from 'dotenv';
dotenv.config();
/**
 * Utility to extract text from Atlassian Document Format (ADF)
 */
function extractTextFromADF(node) {
    if (!node)
        return '';
    if (typeof node === 'string')
        return node;
    if (node.type === 'text')
        return node.text || '';
    if (Array.isArray(node.content))
        return node.content.map(extractTextFromADF).join('');
    if (node.content)
        return extractTextFromADF(node.content);
    return '';
}
export class JiraAgent {
    client;
    constructor() {
        const url = process.env.JIRA_SERVER_URL;
        const email = process.env.JIRA_USER_EMAIL;
        const token = process.env.JIRA_API_TOKEN;
        if (!url || !email || !token) {
            throw new Error("❌ Configuration Error: Missing JIRA credentials in .env");
        }
        this.client = new Version2Client({
            host: url,
            authentication: {
                basic: { email, apiToken: token }
            }
        });
    }
    async searchJql(jqlString, maxResults = 20) {
        try {
            const response = await this.client.issueSearch.searchForIssuesUsingJql({
                jql: jqlString,
                maxResults,
                fields: ['summary', 'description', 'status', 'assignee', 'project', 'comment']
            });
            if (!response?.issues)
                return [];
            return response.issues.map((issue) => {
                const fields = (issue.fields || {});
                const commentArray = fields.comment?.comments ?? [];
                const recentComments = commentArray
                    .slice(-3)
                    .map((c) => extractTextFromADF(c.body))
                    .filter((text) => typeof text === 'string' && text.trim().length > 0);
                return {
                    key: issue.key ?? 'Unknown',
                    summary: fields.summary ?? '',
                    description: extractTextFromADF(fields.description) ?? '',
                    status: fields.status?.name ?? 'Unknown',
                    assignee: fields.assignee?.displayName ?? 'Unassigned',
                    projectKey: fields.project?.key ?? 'Unknown',
                    comments: recentComments
                };
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`❌ JQL Execution Fault: ${message}`);
            return [];
        }
    }
    extractDocumentChunks(issue) {
        const baseMetadata = {
            issueKey: issue.key,
            projectKey: issue.projectKey,
            status: issue.status,
            assignee: issue.assignee
        };
        const chunks = [];
        chunks.push({
            text: `Ticket: ${issue.key}\nSummary: ${issue.summary}\nDescription: ${issue.description}`,
            metadata: { ...baseMetadata, type: 'core_intent' }
        });
        issue.comments.forEach((comment, i) => {
            chunks.push({
                text: `Ticket: ${issue.key} | Comment ${i + 1}: ${comment}`,
                metadata: { ...baseMetadata, type: 'historical_dialogue' }
            });
        });
        return chunks;
    }
}
