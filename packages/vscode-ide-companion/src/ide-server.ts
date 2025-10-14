/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import * as net from 'net';
import * as path from 'path';
// We'll dynamically import core services where needed to avoid ESM/CJS interop issues.

function resolveProvider(value: string, providers: Record<string, string>): string | null {
  const providerValues = Object.values(providers);
  return providerValues.includes(value) ? value : null;
}

/**
 * Finds an available port starting from the given port number
 */
async function findAvailablePort(startPort: number = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      // Port is in use, try next one
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export async function startIDEServer(_context: vscode.ExtensionContext) {
  const app = express();
  app.use(express.json());

  // Serve static files from the public directory
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Auth tree GUI route
  app.get('/auth-tree', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'auth-tree.html'));
  });

  app.get('/auth/layout', async (_req: Request, res: Response) => {
    try {
      const core = (await import('@wren-coder/wren-coder-cli-core')) as any;
      res.json({ ok: true, layout: core.AUTH_TREE_LAYOUT });
    } catch (error) {
      console.error('Error loading auth tree layout:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  mcpServer.connect(transport);

  app.post('/mcp', async (req: Request, res: Response) => {
    console.log('Received MCP request:', req.body);
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get('/mcp', async (req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });

  // Simple CRUD endpoints for provider/auth management used by UI or tree views.
  app.get('/auth/providers', async (_req: Request, res: Response) => {
    try {
  const core = (await import('@wren-coder/wren-coder-cli-core')) as any;
      const providers = core.ProviderConfigService.getAllProviders();
      res.json({ ok: true, providers });
    } catch (error) {
      console.error('Error listing providers:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.post('/auth/providers', async (req: Request, res: Response) => {
    const { provider, baseURL, apiKey } = req.body ?? {};
    if (!provider || !baseURL) {
      return res.status(400).json({ ok: false, error: 'provider and baseURL required' });
    }

    try {
      const core = (await import('@wren-coder/wren-coder-cli-core')) as any;
      const providerValue = provider as string;
      const providerEnum = resolveProvider(providerValue, core.Providers as Record<string, string>);
      if (!providerEnum) {
        return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` });
      }
      const created = core.ProviderConfigService.createProvider(providerEnum, baseURL, apiKey);
      res.json({ ok: created });
    } catch (error) {
      console.error('Error creating provider:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.put('/auth/providers/:provider', async (req: Request, res: Response) => {
    const providerParam = req.params.provider as string;
    const updates = req.body ?? {};

    try {
      const core = (await import('@wren-coder/wren-coder-cli-core')) as any;
      const providerEnum = resolveProvider(providerParam, core.Providers as Record<string, string>);
      if (!providerEnum) {
        return res.status(400).json({ ok: false, error: `Unknown provider: ${providerParam}` });
      }
      const updated = core.ProviderConfigService.updateProvider(providerEnum, updates);
      res.json({ ok: updated });
    } catch (error) {
      console.error('Error updating provider:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.delete('/auth/providers/:provider', async (req: Request, res: Response) => {
    const providerParam = req.params.provider as string;

    try {
      const core = (await import('@wren-coder/wren-coder-cli-core')) as any;
      const providerEnum = resolveProvider(providerParam, core.Providers as Record<string, string>);
      if (!providerEnum) {
        return res.status(400).json({ ok: false, error: `Unknown provider: ${providerParam}` });
      }
      const deleted = core.ProviderConfigService.deleteProvider(providerEnum);
      res.json({ ok: deleted });
    } catch (error) {
      console.error('Error deleting provider:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  // Slash command scaffold for /reorg — accepts a POST request with { sessionId, payload }
  // This is infrastructure only; actual reorganization logic should be implemented in core/context reorg services.
  app.post('/reorg', express.json(), async (req: Request, res: Response) => {
    try {
      const { sessionId, payload } = req.body || {};
      console.log('/reorg called', { sessionId, payload });

      // Hook into context reorg service
      const core = (await import('@wren-coder/wren-coder-cli-core')) as any;

      // Extract messages and options from payload
      const { messages = [], trigger = 'manual', parameters, memoryItems, activeTasks, criticalReferences } = payload || {};

      // Create ReorgService instance with Config
      const config = new core.Config({ sessionId });
      const reorgService = new core.ReorgService(config);

      // Execute reorganization
      const result = await reorgService.reorganize({
        trigger,
        messages,
        parameters,
        memoryItems,
        activeTasks,
        criticalReferences,
      });

      res.json({
        ok: true,
        message: 'Reorg completed successfully',
        sessionId,
        result: {
          dumpPath: result.dumpPath,
          dumpFilename: result.dumpFilename,
          estimatedTokens: result.estimatedTokens,
          compressedPrompt: result.compressedPrompt,
        }
      });
    } catch (err) {
      console.error('Error in /reorg:', err);
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // Models discovery endpoint - only available in extension context where
  // vscode.lm.selectChatModels() can be called. Returns an array of
  // simplified model descriptors suitable for the CLI to consume.
  app.get('/models', async (_req: Request, res: Response) => {
    try {
      if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
        return res.status(500).json({ ok: false, error: 'VSCode Language Model API unavailable' });
      }

      // Query all available chat models. Extensions may filter by vendor
      // but here we request the full set and let the consumer decide.
      // The API returns LanguageModelChat objects; we convert to a
      // lightweight JSON form that contains only the necessary metadata.
      // Note: selectChatModels may prompt the user for consent depending
      // on VS Code configuration; this call should remain in extension
      // context only.
      const languageModels = await vscode.lm.selectChatModels();

      const models = (languageModels || []).map((m: any) => ({
        id: m.id,
        vendor: m.vendor,
        family: m.family,
        maxInputTokens: typeof m.maxInputTokens === 'number' ? m.maxInputTokens : undefined,
      }));

      res.json({ ok: true, models });
    } catch (error) {
      console.error('Error enumerating VSCode models:', error);
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  // Server-Sent Events endpoint to notify clients when VSCode models change.
  // Clients can re-query /models on receiving an event named 'models-changed'.
  const sseClients: Response[] = [];
  app.get('/models/stream', (req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders?.();
    res.write('retry: 10000\n\n');

    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx >= 0) {
        sseClients.splice(idx, 1);
      }
    });
  });

  // Listen for model registry changes from VS Code and broadcast to SSE
  // clients so external processes (CLI) can re-check /models.
  try {
    if (vscode.lm && typeof vscode.lm.onDidChangeChatModels === 'function') {
      vscode.lm.onDidChangeChatModels(() => {
        console.log('VSCode chat models changed; notifying clients');
        for (const client of sseClients) {
          try {
            client.write(`event: models-changed\n`);
            client.write(`data: {}\n\n`);
          } catch (err) {
            // ignore write errors; cleanup happens on close
          }
        }
      });
    }
  } catch (err) {
    // If the API is unavailable, don't crash the server.
    console.warn('VSCode LM change listener unavailable:', err);
  }

  // Start the server with dynamically generated port
  const PORT = await findAvailablePort(3000);

  // Write port to environment variable for access by other processes
  process.env.WREN_IDE_SERVER_PORT = PORT.toString();

  app.listen(PORT, (error) => {
    if (error) {
      console.error('Failed to start server:', error);
      vscode.window.showErrorMessage(
        `Companion server failed to start on port ${PORT}: ${error.message}`,
      );
    }
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
    console.log(`Port ${PORT} is available via environment variable WREN_IDE_SERVER_PORT`);
  });
}

const createMcpServer = () => {
  const server = new McpServer({
    name: 'vscode-ide-server',
    version: '1.0.0',
  });
  server.registerTool(
    'getActiveFile',
    {
      description:
        '(IDE Tool) Get the path of the file currently active in VS Code.',
      inputSchema: {},
    },
    async () => {
      try {
        const activeEditor = vscode.window.activeTextEditor;
        const filePath = activeEditor
          ? activeEditor.document.uri.fsPath
          : undefined;
        if (filePath) {
          return {
            content: [{ type: 'text', text: `Active file: ${filePath}` }],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: 'No file is currently active in the editor.',
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get active file: ${
                (error as Error).message || 'Unknown error'
              }`,
            },
          ],
        };
      }
    },
  );
  return server;
};
