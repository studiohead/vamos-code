# Claude Engineering Memory Profile

## 🛠️ Build & Runtime Automation Commands
- **Install Dependencies:** `npm install`
- **Boot Development Agent Sandbox Loop:** `node index.js`
- **Execute Workspace Test Verification:** `node workspace/index.js`

## 🎯 Code Generation Principles & Architectural Standards
- **Zero Omission Policy:** NEVER generate code containing pseudo-code placeholders, inline comments suggesting replacements (`// implement here`), or structural ellipses (`...`). Always emit the complete, production-ready source code structure regardless of scale.
- **Cross-Platform Resiliency:** All automated shell commands must gracefully resolve on both Unix/Linux platforms and Windows host execution targets (using explicit POSIX shell path overrides or appropriate path delimiter symbols `;` vs `:` dynamically).
- **Hard Isolation Controls:** Never authorize runtime execution access to configuration environments (`.env`), key storage modules, or platform-level binary configurations.
- **Human Integrity Gatekeeping:** Critical destructive operations, modification files, or complex routing updates require explicit human interaction validation routines.
- **Context Telemetry:** Maintain strict rolling calculation matrices matching target tokens (Default fallback footprint limit optimized targeting 1,000,000 token maximum context windows).