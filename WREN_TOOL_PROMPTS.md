# Wren Tool Prompts Documentation

This document lists all the tool prompts (descriptions) that Wren receives from the LLM.

## Core Built-in Tools

### 1. ReadFile (read_file)
**Description:**
> Reads and returns the content of a specified file from the local filesystem. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.

**Parameters:**
- `absolute_path` (string, required): The absolute path to the file to read
- `offset` (number, optional): Line number to start reading from
- `limit` (number, optional): Number of lines to read

---

### 2. ReadManyFiles (read_many_files)
**Description:**
> Reads multiple files in a single operation. More efficient than calling read_file multiple times.

**Parameters:**
- `absolute_paths` (array of strings, required): Array of absolute file paths to read

---

### 3. WriteFile (write_file)
**Description:**
> Writes content to a file on the local filesystem. Creates the file if it doesn't exist, or overwrites it if it does.

**Parameters:**
- `absolute_path` (string, required): The absolute path where the file should be written
- `content` (string, required): The content to write to the file

---

### 4. Edit (edit)
**Description:**
> Performs exact string replacements in files. Used for making targeted edits to existing files.

**Parameters:**
- `absolute_path` (string, required): The absolute path to the file to edit
- `old_string` (string, required): The exact text to replace
- `new_string` (string, required): The text to replace it with
- `replace_all` (boolean, optional): Replace all occurrences (default: false)

---

### 5. Glob (glob)
**Description:**
> Fast file pattern matching tool that works with any codebase size. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time.

**Parameters:**
- `pattern` (string, required): The glob pattern to match files against
- `path` (string, optional): The directory to search in (defaults to current working directory)

---

### 6. Grep (grep)
**Description:**
> A powerful search tool built on ripgrep. Supports full regex syntax and can filter files by type or glob pattern.

**Parameters:**
- `pattern` (string, required): The regular expression pattern to search for
- `path` (string, optional): File or directory to search in
- `glob` (string, optional): Glob pattern to filter files (e.g., "*.js")
- `type` (string, optional): File type to search (e.g., "js", "py", "rust")
- `output_mode` (string, optional): "content", "files_with_matches", or "count"
- `-i` (boolean, optional): Case insensitive search
- `-n` (boolean, optional): Show line numbers
- `-A` (number, optional): Lines to show after match
- `-B` (number, optional): Lines to show before match
- `-C` (number, optional): Lines to show before and after match
- `head_limit` (number, optional): Limit output to first N results
- `multiline` (boolean, optional): Enable multiline mode

---

### 7. LS (ls)
**Description:**
> Lists directory contents with detailed information including file sizes, modification times, and permissions.

**Parameters:**
- `absolute_path` (string, required): The absolute path to the directory to list

---

### 8. Shell (shell)
**Description:**
> Executes bash commands in a persistent shell session. Supports background execution and command chaining.

**Parameters:**
- `command` (string, required): The bash command to execute
- `timeout` (number, optional): Timeout in milliseconds (max 600000)
- `run_in_background` (boolean, optional): Run command in background

---

### 9. WebFetch (web_fetch)
**Description:**
> Fetches content from a specified URL and processes it using an AI model. Converts HTML to markdown and returns analyzed content.

**Parameters:**
- `url` (string, required): The URL to fetch content from
- `prompt` (string, required): The prompt to run on the fetched content

---

### 10. Memory (memory)
**Description:**
> Persistent memory tool for storing and retrieving information across sessions. Uses markdown files for storage.

**Parameters:**
- `action` (string, required): "store" or "retrieve"
- `key` (string, required): The key to store/retrieve data under
- `value` (string, optional): The value to store (required for "store" action)

---

## Discovered Tools

### Tool Discovery Mechanism

Wren can discover additional tools from:

1. **Project-specific tools** via `toolDiscoveryCommand` configuration
2. **MCP (Model Context Protocol) servers** for external tool integration

#### Tool Discovery Command

When configured, Wren executes a discovery command that returns JSON array of tool definitions:

```json
[
  {
    "name": "tool_name",
    "description": "Tool description that becomes the prompt",
    "parameters": {
      "type": "object",
      "properties": {
        "param1": { "type": "string", "description": "..." }
      }
    }
  }
]
```

**Discovery Command Prompt Addition:**

Discovered tools automatically receive this additional context in their description:

> This tool was discovered from the project by executing the command `{discoveryCmd}` on project root.
> When called, this tool will execute the command `{callCmd} {toolName}` on project root.
> Tool discovery and call commands can be configured in project or user settings.
>
> When called, the tool call command is executed as a subprocess.
> On success, tool output is returned as a json string.
> Otherwise, the following information is returned:
>
> Stdout: Output on stdout stream. Can be `(empty)` or partial.
> Stderr: Output on stderr stream. Can be `(empty)` or partial.
> Error: Error or `(none)` if no error was reported for the subprocess.
> Exit Code: Exit code or `(none)` if terminated by signal.
> Signal: Signal number or `(none)` if no signal was received.

---

## MCP (Model Context Protocol) Tools

MCP servers can provide additional tools. Each MCP server is configured with:

```typescript
{
  command: string,        // Command to start MCP server
  args: string[],         // Command arguments
  env: Record<string, string>, // Environment variables
  url: string,            // For SSE transport
  httpUrl: string,        // For HTTP transport
  tcp: string,            // For TCP transport
  timeout: number,        // Connection timeout
  trust: boolean,         // Whether to trust the server
  includeTools: string[], // Whitelist specific tools
  excludeTools: string[]  // Blacklist specific tools
}
```

MCP tools inherit their descriptions from the MCP server's tool definitions.

---

## Tool Configuration

### Enabling/Disabling Core Tools

Tools can be enabled/disabled via configuration:

```json
{
  "coreTools": ["ReadFile", "WriteFile", "Grep", "Shell"],
  "excludeTools": ["WebFetch"]
}
```

### Parameter Schema Sanitization

Wren automatically sanitizes tool parameters for Gemini API compatibility:

- Removes `default` property when `anyOf` is present
- Removes unsupported `format` values (keeps only 'enum' and 'date-time')
- Handles circular references in schemas

---

## Tool Execution Flow

1. **LLM receives tool descriptions** (the prompts shown above)
2. **LLM decides to call a tool** with specific parameters
3. **Wren validates parameters** against the schema
4. **Tool executes** and returns results
5. **Results sent back to LLM** for interpretation

---

## Current Default Tools (Enabled)

As of the current configuration in [config.ts:647-660](packages/core/src/config/config.ts#L647-L660):

✅ LSTool
✅ ReadFileTool
✅ GrepTool
✅ GlobTool
✅ EditTool
✅ WriteFileTool
✅ WebFetchTool
✅ ReadManyFilesTool
✅ ShellTool
✅ MemoryTool
❌ WebSearchTool (temporarily disabled)

Plus any discovered tools from:
- Project tool discovery command
- MCP servers

---

## File Locations

- **Tool implementations**: `packages/core/src/tools/`
- **Tool registry**: `packages/core/src/tools/tool-registry.ts`
- **Configuration**: `packages/core/src/config/config.ts`
- **MCP client**: `packages/core/src/tools/mcp-client.ts`

---

## References

- Tool Registry: [tool-registry.ts](packages/core/src/tools/tool-registry.ts)
- Config: [config.ts](packages/core/src/config/config.ts)
- MCP Documentation: [docs/tools/mcp-server.md](docs/tools/mcp-server.md)
