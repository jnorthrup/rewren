# Wren Coder IDE Companion - VSCode Extension

VSCode extension enabling **dynamic VSCode Language Model discovery** and **bulletproof Auth Tree GUI** for Wren CLI.

## What It Does

- Starts HTTP server (port 3000+) in VS Code extension context
- Exposes `/models` endpoint querying `vscode.lm.selectChatModels()`
- Returns real VSCode language models (GitHub Copilot, custom models, etc.)
- **NEW:** Bulletproof Auth Tree GUI at `/auth-tree` for managing providers
- Wren CLI fetches models and displays in `/auth` tree
- Supports Server-Sent Events at `/models/stream` for live updates
- Full CRUD operations for provider management with hierarchical tree view

## Running the Extension

### From Monorepo Root

1. Open Run and Debug panel (`Cmd+Shift+D`)
2. Select **"Run VSCode Extension"**
3. Press **F5**

### From Extension Folder

1. Open `/packages/vscode-ide-companion/` in VS Code
2. Press **F5**

Extension auto-activates (`onStartupFinished`) and starts IDE server on port 3000.
Check Debug Console for: `MCP Streamable HTTP Server listening on port 3000`

## Usage

Once extension running:

```bash
npm start
> /auth
  📁 VSCode
    🤖 copilot-gpt-4o
    # ... your actual VS Code models
```

## Architecture

See [vscode-llm-architecture.md](../core/src/config/providers/vscode-llm-architecture.md)

## Auth Tree GUI

**Bulletproof CRUD interface** for managing AI providers with a hierarchical tree design.

### Features

- **Split-pane layout**: Hierarchy tree on left, detailed view on right
- **Full CRUD operations**: Create, Read, Update, Delete providers
- **Real-time updates**: Live status updates and error handling
- **Performance metrics**: View provider statistics and health
- **Keyboard shortcuts**: F5 refresh, Escape to cancel
- **Inline search**: Press `/` or use the status-bar search box to filter providers instantly
- **Responsive design**: Works on different screen sizes

### Accessing the GUI

Once extension is running on port 3000+:

1. Open browser to: `http://localhost:{PORT}/auth-tree`
2. Or use the VS Code Simple Browser: `vscode.open` with URL

### GUI Layout

```
┌─────────────────────────────────────────────────┐
│                    Auth Tree GUI                │
├─────────────────┬───────────────────────────────┤
│                 │                               │
│  HIERARCHY      │        DETAIL PANEL           │
│  TREE           │                               │
│                 │  ┌─────────────────────────┐  │
│  📁 Providers   │  │ Provider Details        │  │
│    ├── 🤖 OPENAI│  │                         │  │
│    └── 🧠 ANTH. │  │ Status: Enabled          │  │
│                 │  │ Base URL: ...           │  │
│  SELECTOR       │  │ API Key: •••••••        │  │
│  LISTBOX        │  │                         │  │
│                 │  └─────────────────────────┘  │
│  👤 Identity    │                               │
│  ⚙️ Configs     │                               │
│  📊 Metrics     │                               │
└─────────────────┴───────────────────────────────┘
│ Ready                           2 providers     │
└─────────────────────────────────────────────────┘
```

### API Endpoints

**Provider CRUD:**

- `GET /auth/providers` - List all providers
- `POST /auth/providers` - Create new provider
- `PUT /auth/providers/:provider` - Update provider
- `DELETE /auth/providers/:provider` - Delete provider

**GUI:**

- `GET /auth-tree` - Auth Tree GUI interface

**Models:**

- `GET /models` - Returns VSCode models as JSON
- `GET /models/stream` - SSE endpoint for model changes

## JSON CRUD Facade Blueprint

The `/auth` routes currently expose provider-specific CRUD via `ProviderConfigService`. To generalize this “bulletproof JSON” surface, build on these pieces:

1. **Generic Repository Contract**  
   Create a shared `CrudRepository<T, K>` interface (`list`, `get`, `create`, `update`, `delete`). Adapt `ProviderConfigService` to implement it while keeping file persistence and Bayesian weighting private.

2. **Validator Hooks**  
   Pair the repository with entity-specific validators or schema guards so the facade enforces consistent request/response envelopes while each resource supplies its own rules.

3. **Router Factory**  
   Add `createCrudRouter({ repo, validator, idParam, toId })` that returns an Express router exposing list/create/update/delete with the standard `{ ok, data }` payload. Mount it for providers by wiring in the provider repository and enum coercion.

4. **UI Consumption**  
   Have `AuthTreeManager` consume the generic payload (e.g., `data` instead of `providers`), so the same front-end utilities can point at other resources like models or quotas with minimal changes.

5. **Tree Integration**  
   Implement additional repositories on top of `JsonGraphCRUD` (see `packages/core/src/config/tree/jsonGraphCRUD.ts`) to let the same facade manage quota or model nodes without exposing tree complexity to the browser.

## Environment Variables

- `WREN_IDE_SERVER_PORT`: Server port (default: 3000)
- `NO_IDE_MODE`: Set to "1" to disable IDE integration

## Troubleshooting

**VSCode provider not in `/auth`:**

- Verify extension running (check Debug Console)
- Test: `curl http://localhost:3000/models`
- Rebuild: `npm run build` from root
