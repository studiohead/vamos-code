# VAMOS Code: Autonomous Development
A secure, sandboxed orchestration environment that runs multi-turn developer agent loops using Amazon Bedrock API keys (Bearer Tokens). This setup bypasses traditional multi-variable IAM credential configurations in favor of a streamlined, single key setup.

```
┌────────────────────────────────────────────────────────┐
│                   1. THE BRAIN (LLM)                   │
│          Claude 3.5 Sonnet (Bedrock API Layer)         │
└───────────────────────────┬────────────────────────────┘
                            │ Returns Tasks or Code/Bash
                            ▼
┌────────────────────────────────────────────────────────┐
│               2. THE VAMOS DISPATCHER                  │
│       index.ts (Routing, Telemetry, Guard Rails)       │
└───────────────┬───────────────────────────────┬────────┘
                │ Routes to Agent Personality   │
      ┌─────────┴─────────┐           ┌─────────┴─────────┐
      │   3A. CODE AGENT  │           │   3B. JIRA AGENT  │
      │ (Repo Management) │           │(Task Orchestrator)│
      └─────────┬─────────┘           └─────────┬─────────┘
                │ Executes/Consults             │
                ▼                               ▼
┌────────────────────────────────────────────────────────┐
│                      4. THE BODY                       │
│    The Workspace & Binaries (agent-patch, view-tree).  |
|    eBPF: Tetragon Kernel Observability (Monitor/Guard) │
└────────────────────────────────────────────────────────┘
```

## Key Features
Single-Token Authentication: Powered by a single AWS_BEDROCK_API_KEY mapped directly to the AWS Bedrock client runtime.

## Contextual Governance: 
Tracks rolling token counts (MAX_CONTEXT_TOKENS) to safeguard against budget runoff and runaway agent execution loops.

## Isolated Command Sandbox: 
Kernel-enforced sandboxing leveraging Tetragon for real-time eBPF security observability.

## Pre-flight System Diagnostics: 
Automated checks for required binaries (e.g., tetra) with fallback simulation support for non-kernel-monitored environments.

## Human-In-The-Loop Verification: 
Automatically halts and prompts for authorization if the agent constructs complex commands with file redirects or destructive pipelines.

## Architecture Overview
index.ts: Environment initialization runtime, system dependency validation (checkSystemDependencies), context telemetry tracking, threat detection matrix, and guarded bash runner.

jira-agent.ts: Hardened Jira orchestrator utilizing jira.js with defensive ADF normalization and strict type enforcement via types.ts.

agent.ts: Core autonomous state orchestrator executing multi-turn system instructions utilizing the Bedrock Messages API (InvokeModelCommand).

Installation & Setup
1. Prerequisites
Ensure the Tetragon CLI (tetra) is installed for full kernel-level observability:


# macOS
```
brew install tetra
```

# Linux
```
curl -L https://github.com/cilium/tetragon/releases/latest/download/tetra-linux-amd64.tar.gz | tar -xz
sudo mv tetra /usr/local/bin/
```
2. Install Dependencies
Clone the repository, configure node packages, and add the necessary AWS and Jira client runtimes:

```
npm install
npm install @aws-sdk/client-bedrock-runtime jira.js dotenv unbash
npm install --save-dev @types/node
```

3. Environment Configuration
Create a .env file in the project root:

```
AWS_BEDROCK_API_KEY=your_key_here
JIRA_SERVER_URL=https://your-domain.atlassian.net
JIRA_USER_EMAIL=you@example.com
JIRA_API_TOKEN=your_token_here
```

## MIT License
Copyright (c) 2026 Stephen Johnny Davis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
