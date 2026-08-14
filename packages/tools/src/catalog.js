export const TOOL_DEFINITIONS = [
  {
    name: "list_files",
    description: "List files and folders inside the active workspace.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative folder path" }, maxDepth: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file inside the active workspace.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, startLine: { type: "number", description: "1-indexed line to start from" }, endLine: { type: "number", description: "1-indexed line to end at (inclusive)" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_text",
    description: "Search text across workspace source files. Returns matches with line numbers and previews.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, regex: { type: "boolean" }, caseSensitive: { type: "boolean" }, contextLines: { type: "number", description: "Lines of context to include around each match (0-5)" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "grep",
    description: "Advanced grep with regex, file pattern filtering, and context lines. More powerful than search_text.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Relative folder to search in (default: '.')" },
        glob: { type: "string", description: "Glob pattern to filter files, e.g. '*.js' or '**/*.ts'" },
        caseSensitive: { type: "boolean" },
        contextBefore: { type: "number", description: "Lines of context before match (0-5)" },
        contextAfter: { type: "number", description: "Lines of context after match (0-5)" },
        maxResults: { type: "number", description: "Maximum matches to return (default 50)" },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description: "Create or replace a file. This operation requires user approval.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "replace_text",
    description: "Replace one unique text occurrence. This operation requires user approval.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
      required: ["path", "oldText", "newText"],
      additionalProperties: false,
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the workspace. Mutating commands require user approval.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" }, timeout: { type: "number" }, cwd: { type: "string", description: "Relative working directory (default: workspace root)" } },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL. Returns text content (HTML stripped to text for HTML responses). Read-only — does not mutate the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTP(S) URL to fetch" },
        method: { type: "string", description: "HTTP method (default GET)" },
        headers: { type: "object", description: "Request headers" },
        body: { type: "string", description: "Request body for POST/PUT" },
        maxBytes: { type: "number", description: "Max bytes to read (default 500KB)" },
        asText: { type: "boolean", description: "If true (default), strip HTML tags from HTML responses" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "auto_fix",
    description: "Automatically detect and fix issues in a file or directory. Runs lint, applies fixes, and verifies the result. Supports JS/TS (ESLint), JSON, Markdown (Prettier), and basic syntax fixes.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to fix" },
        fixers: { type: "array", items: { type: "string", enum: ["eslint", "prettier", "json", "trailing-newline", "tabs-to-spaces"] }, description: "Fixers to apply (default: all relevant)" },
        dryRun: { type: "boolean", description: "If true, report what would be fixed without applying changes" },
        verify: { type: "boolean", description: "If true (default), run `node --check` or test after fix to verify" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_tests",
    description: "Run the project's test suite and return structured results. Detects npm scripts, node --test, vitest, jest, and pytest automatically.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Test file pattern or name (optional)" },
        watch: { type: "boolean", description: "Run in watch mode (default false)" },
        timeout: { type: "number", description: "Timeout in ms (default 60000)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "parse_ast",
    description: "Parse a source file and return its AST structure (functions, classes, imports, exports). Supports JS/TS via a built-in parser. Useful for understanding code structure without reading the entire file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File to parse" },
        detail: { type: "string", enum: ["summary", "full"], description: "summary (default) returns names only; full returns positions and params" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "spawn_subagent",
    description: "Spawn a sub-agent to work on a specific subtask. The sub-agent runs with its own conversation loop and returns a result. Useful for parallel work or isolating complex subtasks.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The subtask prompt for the sub-agent" },
        mode: { type: "string", enum: ["build", "plan", "design", "review"], description: "Mode for the sub-agent (default: build)" },
        maxSteps: { type: "number", description: "Max steps for the sub-agent (default: 5)" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "todo_update",
    description: "Add, update, or remove items from the session todo list. Use this to plan multi-step work and show the user what you intend to do.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "update", "remove", "clear", "list"], description: "Operation to perform" },
        id: { type: "string", description: "Todo id (required for update/remove)" },
        content: { type: "string", description: "Todo content (for add/update)" },
        status: { type: "string", enum: ["pending", "in_progress", "completed", "skipped"] },
        priority: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "search_index",
    description: "Fast trigram-based symbol search across the workspace. Returns ranked results. Much faster than grep for finding identifiers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (min 3 chars for trigram match)" },
        limit: { type: "number", description: "Max results (default 20)" },
        rebuild: { type: "boolean", description: "Force rebuild the index before searching" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "worktree",
    description: "Manage Git worktrees for parallel work on separate branches. Requires Git to be initialized.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "add", "remove"], description: "Operation" },
        name: { type: "string", description: "Branch name (for add/remove)" },
        base: { type: "string", description: "Base branch for the new worktree (default: current HEAD)" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];
