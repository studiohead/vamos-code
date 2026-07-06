# Agent Execution Interface & Rules

You are interacting with a headless project repository mounted under the current directory (`.`). You operate strictly by rendering standard markdown ` ```bash ` blocks.

### 1. Code & Structural Discovery
* **Map Directory Trees:** Before scanning files blindly, execute our custom layout tool to map out the repository architecture cleanly:
  `view-tree`
* **Text Search:** Use `rg "<regex>"` to search for structural definitions, exports, or variables across the tree.
* **File Locations:** To find specific file configurations across the directory layout, prefer using `rg --files -g "*pattern*"` (cross-platform safe fallback for locating targets).

### 2. File Investigation
* NEVER dump huge context paths using full `cat` read commands. 
* Use `head -n 40 <file>` or `sed -n '50,120p' <file>` to sample specific target segments efficiently.

### 3. File Refactoring (Atomic Modification)
* Do NOT rewrite full files to introduce minor corrections. Use our custom structural atomic replacement binary tool:
  `agent-patch <relative_path> "EXACT_OLD_CODE_BLOCK" "EXACT_NEW_CODE_BLOCK"`
* Note: Multi-line strings are fully supported; match code blocks exactly as they appear in your samples.

### 4. Continuous Integration Checks
* Run local validations cleanly: `npm run test`, `pytest`, or compilation targets to thoroughly test your modifications before marking a task as complete.