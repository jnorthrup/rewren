/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Blessed from 'blessed';
import { Config, getProviderTree, TreeNode, ProviderNode, ModelNode } from '@rewren/rewren-core';
import { LoadedSettings } from '../config/settings.js';
import { CommandService } from '../services/CommandService.js';
import { CommandContext } from './commands/types.js';
import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createServer } from 'net';

interface BlessedTuiOptions {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
}

export class BlessedTui {
  private screen!: Blessed.Widgets.Screen;
  private header!: Blessed.Widgets.BoxElement;
  private historyBox!: Blessed.Widgets.BoxElement;
  private treeBox!: Blessed.Widgets.BoxElement;
  private detailBox!: Blessed.Widgets.BoxElement;
  private inputField!: Blessed.Widgets.TextboxElement;
  private footer!: Blessed.Widgets.BoxElement;
  private statusLine!: Blessed.Widgets.BoxElement;

  private config: Config;
  private settings: LoadedSettings;
  private version: string;
  private startupWarnings: string[];
  private isProcessing: boolean = false;
  private commandService: CommandService;
  private showProviderTree: boolean = false;

  // Provider tree state
  private treeRoot = getProviderTree();
  private selectedNodeIndex = 0;
  private expandedNodes = new Set<string>(['root']);
  private flattenedNodes: Array<{ node: TreeNode; depth: number; id: string }> = [];
  // listeners for model selection via the provider tree
  private modelSelectionListeners: Array<(modelName: string) => void> = [];

  /**
   * Programmatically select a model (as if the user pressed Enter on it).
   * This notifies any awaiting `selectModelViaTree()` promises and updates the UI.
   */
  public programmaticSelectModel(modelName: string) {
    try {
      this.config.setModel(modelName);
      this.statusLine.setContent(`Model: ${this.config.getModel()} | Dir: ${this.config.getTargetDir()}`);
    }
    catch (e) {
      this.logDebug(`programmaticSelectModel error: ${String(e)}`);
    }
    // notify listeners
    for (const cb of this.modelSelectionListeners) {
      try { cb(modelName); } catch (e) { /* ignore */ }
    }
    this.modelSelectionListeners = [];
    // hide tree if visible
    if (this.showProviderTree) this.hideProviderTree();
  }

  /**
   * Show the provider tree and return a Promise that resolves when the user
   * selects a model (presses Enter on a ModelNode). The promise resolves to the model name.
   */
  public selectModelViaTree(): Promise<string> {
    return new Promise((resolve) => {
      this.modelSelectionListeners.push((m) => resolve(m));
      this.showProviderTreeView();
    });
  }
  private debugLogPath: string;
  private robotSocket: any;

  private logDebug(message: string) {
    try {
      appendFileSync(this.debugLogPath, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {
      // ignore
    }
  }

  // Keep an in-memory log of messages for QA assertions
  private messageLines: string[] = [];

  constructor(options: BlessedTuiOptions) {
    this.config = options.config;
    this.settings = options.settings;
    this.startupWarnings = options.startupWarnings || [];
    this.version = options.version;
    this.commandService = new CommandService();

    // Create debug log path
    this.debugLogPath = join(process.cwd(), '.wren', 'tui-debug.log');
    try {
      writeFileSync(this.debugLogPath, `[${new Date().toISOString()}] TUI Debug Log Started\n`);
    } catch (e) {
      // ignore
    }

    this.logDebug('BlessedTui constructor called');

    this.initializeScreen();
    this.setupLayout();
    this.setupEventHandlers();
    this.setupRobotSocket();
    this.start();
  }

  private initializeScreen() {
    this.screen = Blessed.screen({
      smartCSR: true,
      title: `Rewren - ${this.config.getTargetDir()}`,
      fullUnicode: true,
      dockBorders: true,
    });

    // Global Ctrl+C handler
    this.screen.key(['C-c', 'q'], () => {
      this.destroy();
      process.exit(0);
    });

    // Prevent input field from blocking Ctrl+C
    this.screen.on('keypress', (ch: any, key: any) => {
      if (key && key.ctrl && key.name === 'c') {
        this.destroy();
        process.exit(0);
      }
    });
  }

  private setupLayout() {
    // Header
    this.header = Blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: `Rewren v${this.version} - ${this.config.getTargetDir()}`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // History area (main content) - will be hidden when tree is shown
    this.historyBox = Blessed.box({
      top: 1,
      left: 0,
      width: '100%',
      height: 'shrink',
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
    });

    // Provider tree pane (left side - hidden by default)
    this.treeBox = Blessed.box({
      top: 1,
      left: 0,
      width: '50%',
      height: '100%-4',
      hidden: true,
      border: { type: 'line' },
      label: ' Provider Tree ',
      scrollable: true,
      keys: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
    });

    // Detail pane (right side - hidden by default)
    this.detailBox = Blessed.box({
      top: 1,
      left: '50%',
      width: '50%',
      height: '100%-4',
      hidden: true,
      border: { type: 'line' },
      label: ' Details ',
      scrollable: true,
      keys: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
    });

    // Input field
    this.inputField = Blessed.textbox({
      top: '100%-3',
      left: 0,
      width: '100%',
      height: 1,
      inputOnFocus: true,
      keys: true,
      mouse: true,
      vi: false, // Disable vi mode to allow arrow keys through
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'black',
          bg: 'white',
        },
      },
    });

    // Ensure Ctrl+C works even when input has focus
    this.inputField.key(['C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // Prevent input field from consuming arrow keys - pass them to screen
    this.inputField.key(['up', 'down', 'left', 'right'], (ch: any, key: any) => {
      // Let screen handle navigation
      this.screen.emit('keypress', ch, key);
    });

    // Status line
    this.statusLine = Blessed.box({
      top: '100%-2',
      left: 0,
      width: '100%',
      height: 1,
      content: `Model: ${this.config.getModel()} | Dir: ${this.config.getTargetDir()}`,
      style: {
        fg: 'grey',
        bg: 'black',
      },
    });

    // Footer
    this.footer = Blessed.box({
      top: '100%-1',
      left: 0,
      width: '100%',
      height: 1,
      content: 'Ctrl+C quit | /auth providers | /help commands | ↑↓ navigate',
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    this.screen.append(this.header);
    this.screen.append(this.historyBox);
    this.screen.append(this.treeBox);
    this.screen.append(this.detailBox);
    this.screen.append(this.inputField);
    this.screen.append(this.statusLine);
    this.screen.append(this.footer);

    this.inputField.focus();
  }

  private setupRobotSocket() {
    // Create a socket server for robot control
    const server = createServer((socket) => {
      this.robotSocket = socket;
      this.logDebug('Robot connected via socket');

      socket.on('data', (data) => {
        const command = data.toString().trim();
        this.logDebug(`Robot command: ${command}`);
        this.handleRobotCommand(command);
      });

      socket.on('end', () => {
        this.logDebug('Robot disconnected');
        this.robotSocket = null;
      });
    });

    // Listen on a local socket file
    const socketPath = join(process.cwd(), '.wren', 'tui-robot.sock');
    try {
      server.listen(socketPath, () => {
        this.logDebug(`Robot socket listening on ${socketPath}`);
      });
    } catch (error) {
      this.logDebug(`Failed to start robot socket: ${(error as Error).message}`);
    }
  }

  private handleRobotCommand(command: string) {
    if (command.startsWith('KEY:')) {
      const key = command.substring(4);
      this.simulateKeyPress(key);
    } else if (command.startsWith('TEXT:')) {
      const text = command.substring(5);
      this.simulateTextInput(text);
    }
  }

  private simulateKeyPress(key: string) {
    // Directly handle tree navigation keys
    if (this.showProviderTree && this.flattenedNodes.length > 0) {
      if (key === 'up') {
        this.selectedNodeIndex = Math.max(0, this.selectedNodeIndex - 1);
        this.logDebug(`TREE: UP key pressed, selectedNodeIndex now ${this.selectedNodeIndex}`);
        this.updateTreeDisplay();
      } else if (key === 'down') {
        this.selectedNodeIndex = Math.min(
          this.flattenedNodes.length - 1,
          this.selectedNodeIndex + 1
        );
        this.logDebug(`TREE: DOWN key pressed, selectedNodeIndex now ${this.selectedNodeIndex}`);
        this.updateTreeDisplay();
      } else if (key === 'right' || key === 'enter') {
        const selected = this.flattenedNodes[this.selectedNodeIndex];
        if (selected) {
          this.logDebug(`TREE: ${key.toUpperCase()} key pressed on node ${selected.id}, toggling`);
          this.toggleNode(selected.id);
        }
      } else if (key === 'escape') {
        this.hideProviderTree();
      }
    } else {
      // Handle keys when tree is not shown
      if (key === 'up') {
        this.logDebug('TREE: UP key pressed (scrolling history)');
        this.historyBox.scroll(-1);
        this.screen.render();
      } else if (key === 'down') {
        this.logDebug('TREE: DOWN key pressed (scrolling history)');
        this.historyBox.scroll(1);
        this.screen.render();
      }
    }
  }

  private simulateTextInput(text: string) {
    // Simulate text input
    this.inputField.setValue(text);
    this.inputField.emit('submit', text);
  }

  private setupEventHandlers() {
    this.inputField.on('submit', (value: string) => {
      if (value.trim()) {
        this.handleInput(value.trim());
      }
      this.inputField.clearValue();
      this.inputField.focus();
      this.screen.render();
    });

    // ESC to close provider tree
    this.screen.key(['escape'], () => {
      if (this.showProviderTree) {
        this.hideProviderTree();
      }
    });

    // Arrow keys for tree navigation - work globally, scroll history when tree hidden
    this.screen.key(['up', 'k'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        this.selectedNodeIndex = Math.max(0, this.selectedNodeIndex - 1);
        this.logDebug(`TREE: UP key pressed, selectedNodeIndex now ${this.selectedNodeIndex}`);
        this.updateTreeDisplay();
      } else {
        this.logDebug('TREE: UP key pressed (scrolling history)');
        // Scroll history up
        this.historyBox.scroll(-1);
        this.screen.render();
      }
    });

    this.screen.key(['down', 'j'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        this.selectedNodeIndex = Math.min(
          this.flattenedNodes.length - 1,
          this.selectedNodeIndex + 1
        );
        this.logDebug(`TREE: DOWN key pressed, selectedNodeIndex now ${this.selectedNodeIndex}`);
        this.updateTreeDisplay();
      } else {
        this.logDebug('TREE: DOWN key pressed (scrolling history)');
        // Scroll history down
        this.historyBox.scroll(1);
        this.screen.render();
      }
    });

    // Enter to select model or toggle expand/collapse
    this.screen.key(['enter'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        const selected = this.flattenedNodes[this.selectedNodeIndex];
        if (selected) {
          // Check if this is a model node - if so, select it
          if (selected.node instanceof ModelNode) {
            const modelName = selected.node.model.name;
            this.logDebug(`TREE: ENTER key pressed on model ${selected.id}, selecting model ${modelName}`);
            this.config.setModel(modelName);
            this.statusLine.setContent(`Model: ${this.config.getModel()} | Dir: ${this.config.getTargetDir()}`);
            this.hideProviderTree();
            // notify any listeners waiting for a model selection
            for (const cb of this.modelSelectionListeners) {
              try { cb(modelName); } catch (e) { /* ignore */ }
            }
            // clear one-shot listeners
            this.modelSelectionListeners = [];
          } else {
            // Otherwise, toggle expand/collapse
            this.logDebug(`TREE: ENTER key pressed on node ${selected.id}, toggling`);
            this.toggleNode(selected.id);
          }
        }
      }
    });

    // Right arrow to toggle expand/collapse (same as Enter)
    this.screen.key(['right', 'l'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        const selected = this.flattenedNodes[this.selectedNodeIndex];
        if (selected) {
          this.logDebug(`TREE: RIGHT key pressed on node ${selected.id}, toggling`);
          this.toggleNode(selected.id);
        }
      } else {
        this.logDebug('TREE: RIGHT key pressed (no action when tree hidden)');
      }
    });
  }

  private async start() {
    await this.commandService.loadCommands();

    if (this.startupWarnings.length > 0) {
      for (const warning of this.startupWarnings) {
        this.addMessage('warning', warning);
      }
    }

    const initialPrompt = this.config.getQuestion();
    if (initialPrompt) {
      setImmediate(() => {
        this.handleInput(initialPrompt);
      });
    }

    this.screen.render();
  }

  private async handleInput(input: string) {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.addMessage('user', `> ${input}`);

    try {
      if (input.startsWith('/')) {
        await this.handleSlashCommand(input);
      } else {
        await this.processQuery(input);
      }
    } catch (error) {
      this.addMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isProcessing = false;
      this.inputField.focus();
      this.screen.render();
    }
  }

  private async handleSlashCommand(input: string) {
    const [cmd, ...argParts] = input.slice(1).split(/\s+/);
    const args = argParts.join(' ');

    const commands = this.commandService.getCommands();
    const command = commands.find(c => c.name === cmd || c.altName === cmd);

    if (!command) {
      this.addMessage('info', `Unknown command: ${input}. Type /help for available commands.`);
      return;
    }

    if (!command.action) {
      this.addMessage('info', `Command ${cmd} has no action defined.`);
      return;
    }

    const context: CommandContext = {
      services: {
        config: this.config,
        settings: this.settings,
        git: undefined,
        logger: console as any,
      },
      ui: {
        addItem: (item: any) => {
          this.addMessage(item.type, item.text || item.content);
          return Date.now();
        },
        clear: () => {
          this.historyBox.setContent('');
          this.screen.render();
        },
        setDebugMessage: (msg: string) => {
          this.addMessage('info', msg);
        },
        // Expose programmatic selection and bayes hooks to commands
        runBayesSelection: (prompt: string, opts?: any) => this.runBayesSelection(prompt, opts),
        selectModelViaTree: () => this.selectModelViaTree(),
        programmaticSelectModel: (m: string) => this.programmaticSelectModel(m),
      },
      session: {
        stats: {} as any,
      },
    };

    try {
      const result = await command.action(context, args);

      if (result) {
        switch (result.type) {
          case 'message':
            this.addMessage(result.messageType, result.content);
            break;
          case 'dialog':
            if (result.dialog === 'providers') {
              this.showProviderTreeView();
            } else if (result.dialog === 'help') {
              this.showHelpDialog();
            } else {
              this.addMessage('info', `Dialog: ${result.dialog}`);
            }
            break;
          case 'tool':
            this.addMessage('info', `Tool call: ${result.toolName}`);
            break;
        }
      }
    } catch (error) {
      this.addMessage('error', `Command error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processQuery(query: string) {
    try {
      const client = this.config.getGeminiClient();
      if (!client) {
        this.addMessage('error', 'No AI client configured. Run /auth to set up a provider.');
        return;
      }

      this.addMessage('info', 'Processing...');

      // Use the streaming method
      const abortController = new AbortController();
      const promptId = Math.random().toString(16).slice(2);

      const stream = client.sendMessageStream(query, abortController.signal, promptId);

      let fullResponse = '';
      for await (const chunk of stream) {
        if (typeof chunk === 'object' && chunk !== null && 'text' in chunk) {
          fullResponse += (chunk as any).text;
        } else if (typeof chunk === 'string') {
          fullResponse += chunk;
        }
      }

      if (fullResponse) {
        this.addMessage('assistant', fullResponse);
      } else {
        this.addMessage('error', 'No response from AI');
      }
    } catch (error) {
      this.addMessage('error', `Query error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private addMessage(type: string, content: string) {
    const timestamp = new Date().toLocaleTimeString();
    let color = 'white';

    switch (type) {
      case 'user':
        color = 'blue';
        break;
      case 'assistant':
        color = 'green';
        break;
      case 'info':
        color = 'yellow';
        break;
      case 'error':
        color = 'red';
        break;
      case 'warning':
        color = 'magenta';
        break;
    }

    const line = `{${color}-fg}[${timestamp}] ${content}{/${color}-fg}`;
    this.historyBox.pushLine(line);
    // Also track raw content for QA checks (strip tags)
    this.messageLines.push(`[${timestamp}] ${content}`);
    this.historyBox.setScrollPerc(100);
    this.screen.render();
  }

  // Return current history plain-text for QA checks
  public getHistoryPlain() {
    return this.messageLines.join('\n');
  }

  /**
   * Return run-length encoded history as array of { count, line } entries.
   * This compacts consecutive identical lines so consumers can iterate lists
   * without empty/duplicate formatting tokens.
   */
  public getHistoryRle(): Array<{ count: number; line: string }> {
    const out: Array<{ count: number; line: string }> = [];
    let prev: string | null = null;
    let cnt = 0;
    for (const l of this.messageLines) {
      if (prev === null) {
        prev = l;
        cnt = 1;
        continue;
      }
      if (l === prev) {
        cnt++;
      } else {
        out.push({ count: cnt, line: prev });
        prev = l;
        cnt = 1;
      }
    }
    if (prev !== null) out.push({ count: cnt, line: prev });
    return out;
  }

  /**
   * Dump the visible screen content with simple whitespace folding.
   * - Preserves line boundaries
   * - Collapses runs of whitespace into a single space on each line
   * Returns a single string with \n-separated lines suitable for diffs or assertions.
   */
  public dumpScreen(): string {
    const lines: string[] = [];
    if (this.showProviderTree) {
      // Include a textual tree snapshot
      this.flattenTree();
      for (let idx = 0; idx < this.flattenedNodes.length; idx++) {
        const item = this.flattenedNodes[idx];
        const indent = '  '.repeat(item.depth);
        const hasChildren = (item.node as any).children?.length > 0;
        const isExpanded = this.expandedNodes.has(item.id);
        const marker = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';
        const selected = idx === this.selectedNodeIndex ? '>' : ' ';
        const label = (item.node as any).label || item.node.constructor.name;
        lines.push(`${selected} ${indent}${marker} ${label}`);
      }
    } else {
      // Use the raw message lines
      lines.push(...this.messageLines);
    }

    // Simple whitespace folding per-line (preserve line breaks)
    const folded = lines.map((l) => l.replace(/\s+/g, ' '));
    return folded.join('\n');
  }

  /**
   * Run a QA script (self-hosted). Script format: array of steps
   * { delay?: ms, input: string, expectContains?: string, expectNotContains?: string }
   * This method blocks (async) until completion and returns {passed: boolean, results: []}
   */
  public async runQaScript(
    sequence: Array<{
      delay?: number;
      input?: string;
      expectContains?: string;
      expectNotContains?: string;
      // Optional assertions on internal state or RLE-encoded history
      assert?: {
        treeVisible?: boolean;
        flattenedMin?: number;
        selectedIndexMin?: number;
        modelChanged?: boolean;
        statusContains?: string;
        // Check presence within the RLE-compressed lines
        rleContains?: string;
      };
    }>,
  ) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const results: Array<{ step: number; ok: boolean; reason?: string }> = [];

    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      if (step.delay && step.delay > 0) await sleep(step.delay);

      if (step.input) {
        // send input (as if user typed with newline)
        this.simulateTextInput(step.input);
      }

      // allow the TUI to process
      await sleep(200);

      const history = this.getHistoryPlain();
      let ok = true;
      let reason: string | undefined;
      if (step.expectContains && !history.includes(step.expectContains)) {
        ok = false;
        reason = `missing '${step.expectContains}'`;
      }
      if (ok && step.expectNotContains && history.includes(step.expectNotContains)) {
        ok = false;
        reason = `unexpected '${step.expectNotContains}'`;
      }

      // Support assertions on RLE-encoded history
      if (ok && step.assert && step.assert.rleContains) {
        const rle = this.getHistoryRle();
        const found = rle.some((e) => e.line.includes(step.assert!.rleContains!));
        if (!found) {
          ok = false;
          reason = `rle missing '${step.assert.rleContains}'`;
        }
      }
      results.push({ step: i, ok, reason });
    }

    const passed = results.every((r) => r.ok);

    // Log a summary to the TUI
    this.addMessage('info', `QA script completed: ${passed ? 'PASS' : 'FAIL'}`);
    for (const r of results) {
      this.addMessage(r.ok ? 'info' : 'error', `Step ${r.step}: ${r.ok ? 'ok' : 'fail'}${r.reason ? ' (' + r.reason + ')' : ''}`);
    }

    return { passed, results };
  }

  private showHelpDialog() {
    this.addMessage('info', '\nAvailable commands:');
    const commands = this.commandService.getCommands();
    for (const cmd of commands) {
      const altName = cmd.altName ? ` (/${cmd.altName})` : '';
      this.addMessage('info', `  /${cmd.name}${altName} - ${cmd.description}`);
    }
    this.addMessage('info', '\nYou can also type any question or request.\n');
  }

  private showProviderTreeView() {
    this.logDebug('TREE: Showing provider tree view');
    this.showProviderTree = true;
    this.historyBox.hide();
    this.treeBox.show();
    this.detailBox.show();
    this.updateTreeDisplay();
    this.screen.render();
  }

  private hideProviderTree() {
    this.showProviderTree = false;
    this.treeBox.hide();
    this.detailBox.hide();
    this.historyBox.show();
    this.inputField.focus();
    this.screen.render();
  }

  private flattenTree() {
    this.flattenedNodes = [];
    const traverse = (node: TreeNode, depth: number, id: string) => {
      this.flattenedNodes.push({ node, depth, id });

      if (this.expandedNodes.has(id)) {
        const children = node.children || [];
        children.forEach((child: TreeNode, idx: number) => {
          const childId = `${id}/${child.label || idx}`;
          traverse(child, depth + 1, childId);
        });
      }
    };
    traverse(this.treeRoot, 0, 'root');
  }

  private toggleNode(id: string) {
    const wasExpanded = this.expandedNodes.has(id);
    if (wasExpanded) {
      this.expandedNodes.delete(id);
      this.logDebug(`TREE: Collapsed node ${id}`);
    } else {
      this.expandedNodes.add(id);
      this.logDebug(`TREE: Expanded node ${id}`);
    }
    this.updateTreeDisplay();
  }

  private updateTreeDisplay() {
    this.flattenTree();

    const lines: string[] = [];
    this.flattenedNodes.forEach((item, idx) => {
      const indent = '  '.repeat(item.depth);
      const isSelected = idx === this.selectedNodeIndex;
      const hasChildren = (item.node.children || []).length > 0;
      const isExpanded = this.expandedNodes.has(item.id);

      // Special marker for identity quota
      const isIdentityQuota = item.node.constructor.name === 'QuotaNode' &&
                               (item.node as any).quotaName === 'identity';
      const marker = isIdentityQuota ? '↺' :
                     hasChildren ? (isExpanded ? '▼' : '▶') : ' ';

      const label = item.node.label || item.node.constructor.name;
      const color = isSelected ? 'cyan' : 'white';

      lines.push(`{${color}-fg}${isSelected ? '>' : ' '} ${indent}${marker} ${label}{/${color}-fg}`);
    });

    this.treeBox.setContent(lines.join('\n'));

    // Update detail pane
    if (this.flattenedNodes[this.selectedNodeIndex]) {
      const selected = this.flattenedNodes[this.selectedNodeIndex].node;
      this.updateDetailDisplay(selected);
    }

    this.screen.render();
  }

  private updateDetailDisplay(node: TreeNode) {
    const lines: string[] = [];
    lines.push(`{bold}Node: ${node.label || node.constructor.name}{/bold}`);
    lines.push('');

    // Show node-specific details
    if (node instanceof ProviderNode) {
      lines.push(`Type: Provider`);
      lines.push(`Provider: ${(node as any).provider || 'unknown'}`);
      const apiKey = process.env[`${(node as any).provider?.toUpperCase()}_API_KEY`];
      lines.push(`API Key: ${apiKey ? '✓ Set' : '✗ Not set'}`);
    } else {
      lines.push(`Type: ${node.constructor.name}`);
    }

    lines.push('');
    lines.push('Children: ' + (node.children || []).length);

    this.detailBox.setContent(lines.join('\n'));
  }

  public destroy() {
    this.screen.destroy();
  }

  /**
   * Run a simple Bayesian model selection over available models in the provider tree.
   * Returns { bestModel, bestScore, details }
   */
  public async runBayesSelection(prompt: string, options?: { useReal?: boolean }) {
    // collect candidate model names from the provider tree
    const candidates: string[] = [];
    const collect = (node: any) => {
      if (node.constructor && node.constructor.name === 'ModelNode') {
        try {
          const name = (node as any).model?.name;
          if (name) candidates.push(name);
        } catch (e) { /* ignore */ }
      }
      const children = node.children || [];
      for (const c of children) collect(c);
    };
    collect(this.treeRoot as any);
    if (candidates.length === 0) throw new Error('No candidate models available');

    // load the local model API simulator
    const modPath = new URL('../../../../scripts/model_api.mjs', import.meta.url).pathname;
    let modelApi;
    try {
      modelApi = await import(modPath);
    } catch (e) {
      throw new Error(`Failed to load model API simulator: ${String(e)}`);
    }

    // simple priors: uniform
    const prior = 1 / candidates.length;
    const scores: Array<{ model: string; likelihood: number; posterior: number; quality: number; latency: number }> = [];
    for (const model of candidates) {
      let r: any;
      if (options?.useReal) {
        // Try to use configured provider client to probe the model
        try {
          const gemini = this.config.getGeminiClient && this.config.getGeminiClient();
          if (gemini) {
            const chat = await gemini.getChat?.({ model });
            const probe = `Probe: please produce a short sentence acknowledging model ${model}`;
            const t0 = Date.now();
            let responseText = '';
            if (chat && chat.sendMessageStream) {
              const stream = await chat.sendMessageStream(
                { message: [{ parts: [{ text: probe }] }], config: {} },
                `probe-${Date.now()}`,
              );
              for await (const chunk of stream) {
                const text = typeof chunk === 'string' ? chunk : (chunk.text || '');
                responseText += text;
              }
            }
            const latency = Date.now() - t0;
            const quality = Math.min(0.99, Math.max(0.01, responseText.length / 200));
            r = { model, quality, latency };
          }
        } catch (e) {
          this.logDebug(`Real probe failed for ${model}: ${String(e)}`);
        }
      }
      if (!r) {
        r = await modelApi.assessModel(model, prompt);
      }
      // convert quality to likelihood via gaussian-like map
      const quality = Number(r.quality) || 0.5;
      const latency = Number(r.latency) || 1000;
      const likelihood = Math.exp(quality * 2.0) / (1 + Math.exp(-quality));
      scores.push({ model, likelihood, posterior: prior * likelihood, quality, latency });
    }
    // normalize posterior
    const total = scores.reduce((s, x) => s + x.posterior, 0) || 1;
    for (const s of scores) s.posterior = s.posterior / total;
    // pick best
    scores.sort((a, b) => b.posterior - a.posterior);
    const best = scores[0];
    return { bestModel: best.model, bestScore: best.posterior, details: scores };
  }

  /**
   * Run a controller script that drives the TUI. Script is an array of steps:
   * [{ delay: <ms>, type?: 'text'|'key', input: string }]
   * If type is omitted, text is assumed. This method is async and returns when
   * the full script has been executed. It intentionally does not present any
   * demo UI output beyond sending inputs to the TUI.
   */
  public async runControllerScript(
    sequence: Array<{ delay?: number; type?: 'text' | 'key'; input: string }>,
  ) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const step of sequence) {
      const d = Number(step.delay || 0);
      if (d > 0) await sleep(d);

      try {
        if (step.type === 'key' || (typeof step.input === 'string' && step.input.startsWith('KEY:'))) {
          const key = step.type === 'key' ? step.input : step.input.replace(/^KEY:/, '');
          this.simulateKeyPress(key);
        } else {
          // default to text
          this.simulateTextInput(step.input);
        }
      } catch (e) {
        this.logDebug(`Controller script error: ${(e as Error).message}`);
      }

      // small pause between steps to allow TUI to process
      await sleep(20);
    }
  }

  public static create(options: BlessedTuiOptions) {
    return new BlessedTui(options);
  }
}
