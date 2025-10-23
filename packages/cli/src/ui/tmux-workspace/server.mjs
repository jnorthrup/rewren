#!/usr/bin/env node
/**
 * Tmux Workspace Manager - Server
 * Manages multiple tmux sessions and provides web interface
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class TmuxWorkspaceManager {
  constructor() {
    this.sessions = new Map();
    this.clients = new Set();
    this.paneStreams = new Map();
  }

  /**
   * Create new tmux session
   */
  async createSession(name, width = 120, height = 40) {
    try {
      await execAsync(`tmux new-session -d -s ${name} -x ${width} -y ${height}`);

      const session = {
        name,
        width,
        height,
        panes: await this.getPanes(name),
        windows: await this.getWindows(name)
      };

      this.sessions.set(name, session);
      this.broadcast({ type: 'session-created', session });

      return session;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Get all panes in a session
   */
  async getPanes(sessionName) {
    try {
      const { stdout } = await execAsync(
        `tmux list-panes -s -t ${sessionName} -F "#{pane_id}:#{pane_width}:#{pane_height}:#{pane_top}:#{pane_left}"`
      );

      return stdout.trim().split('\n').map(line => {
        const [id, width, height, top, left] = line.split(':');
        return { id, width: parseInt(width), height: parseInt(height),
                 top: parseInt(top), left: parseInt(left) };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get all windows in a session
   */
  async getWindows(sessionName) {
    try {
      const { stdout } = await execAsync(
        `tmux list-windows -t ${sessionName} -F "#{window_id}:#{window_name}:#{window_active}"`
      );

      return stdout.trim().split('\n').map(line => {
        const [id, name, active] = line.split(':');
        return { id, name, active: active === '1' };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Stream pane output to clients
   */
  async streamPane(sessionName, paneId) {
    const streamId = `${sessionName}:${paneId}`;

    if (this.paneStreams.has(streamId)) {
      return; // Already streaming
    }

    const proc = spawn('tmux', [
      'pipe-pane',
      '-t', `${sessionName}:${paneId}`,
      '-o',
      'cat'
    ]);

    proc.stdout.on('data', (data) => {
      this.broadcast({
        type: 'pane-output',
        sessionName,
        paneId,
        data: data.toString('base64')
      });
    });

    this.paneStreams.set(streamId, proc);
  }

  /**
   * Send command to pane
   */
  async sendToPane(sessionName, paneId, command) {
    try {
      await execAsync(`tmux send-keys -t ${sessionName}:${paneId} "${command}" C-m`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Split pane
   */
  async splitPane(sessionName, paneId, direction = 'h') {
    try {
      const flag = direction === 'h' ? '-h' : '-v';
      await execAsync(`tmux split-window ${flag} -t ${sessionName}:${paneId}`);

      const panes = await this.getPanes(sessionName);
      this.broadcast({ type: 'panes-updated', sessionName, panes });

      return { success: true, panes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Resize pane
   */
  async resizePane(sessionName, paneId, direction, amount) {
    try {
      const dirMap = { up: '-U', down: '-D', left: '-L', right: '-R' };
      await execAsync(
        `tmux resize-pane -t ${sessionName}:${paneId} ${dirMap[direction]} ${amount}`
      );

      const panes = await this.getPanes(sessionName);
      this.broadcast({ type: 'panes-updated', sessionName, panes });

      return { success: true, panes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List all sessions
   */
  async listSessions() {
    try {
      const { stdout } = await execAsync(
        `tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}"`
      );

      return stdout.trim().split('\n').map(line => {
        const [name, windows, attached] = line.split(':');
        return { name, windows: parseInt(windows), attached: attached === '1' };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    });
  }

  /**
   * Kill session
   */
  async killSession(sessionName) {
    try {
      await execAsync(`tmux kill-session -t ${sessionName}`);
      this.sessions.delete(sessionName);
      this.broadcast({ type: 'session-killed', sessionName });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ============================================
// Server Setup
// ============================================

const app = express();
const manager = new TmuxWorkspaceManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.post('/api/sessions', async (req, res) => {
  try {
    const { name, width, height } = req.body;
    const session = await manager.createSession(name, width, height);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await manager.listSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:name/panes', async (req, res) => {
  try {
    const panes = await manager.getPanes(req.params.name);
    res.json(panes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:name/panes/:paneId/send', async (req, res) => {
  try {
    const result = await manager.sendToPane(
      req.params.name,
      req.params.paneId,
      req.body.command
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:name/panes/:paneId/split', async (req, res) => {
  try {
    const result = await manager.splitPane(
      req.params.name,
      req.params.paneId,
      req.body.direction
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:name/panes/:paneId/resize', async (req, res) => {
  try {
    const result = await manager.resizePane(
      req.params.name,
      req.params.paneId,
      req.body.direction,
      req.body.amount
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:name', async (req, res) => {
  try {
    const result = await manager.killSession(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start HTTP server
const PORT = process.env.PORT || 3030;
const server = app.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════╗`);
  console.log(`║  Tmux Workspace Manager Server        ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(``);
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Open in browser to access visual workspace`);
  console.log(``);
});

// WebSocket server for live streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  manager.clients.add(ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'stream-pane':
          await manager.streamPane(message.sessionName, message.paneId);
          break;

        case 'send-command':
          await manager.sendToPane(
            message.sessionName,
            message.paneId,
            message.command
          );
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    manager.clients.delete(ws);
  });
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  process.exit(0);
});
