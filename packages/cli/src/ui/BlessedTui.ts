/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Blessed from 'blessed';
import { Config, getProviderTree, TreeNode, ProviderNode } from '@wren-coder/wren-coder-cli-core';
import { LoadedSettings } from '../config/settings.js';
import { CommandService } from '../services/CommandService.js';
import { CommandContext } from './commands/types.js';

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

  constructor(options: BlessedTuiOptions) {
    this.config = options.config;
    this.settings = options.settings;
    this.startupWarnings = options.startupWarnings || [];
    this.version = options.version;
    this.commandService = new CommandService();

    this.initializeScreen();
    this.setupLayout();
    this.setupEventHandlers();
    this.start();
  }

  private initializeScreen() {
    this.screen = Blessed.screen({
      smartCSR: true,
      title: `Wren Coder - ${this.config.getTargetDir()}`,
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
      content: `Wren Coder v${this.version} - ${this.config.getTargetDir()}`,
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

    // Arrow keys for tree navigation
    this.screen.key(['up', 'k'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        this.selectedNodeIndex = Math.max(0, this.selectedNodeIndex - 1);
        this.updateTreeDisplay();
      }
    });

    this.screen.key(['down', 'j'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        this.selectedNodeIndex = Math.min(
          this.flattenedNodes.length - 1,
          this.selectedNodeIndex + 1
        );
        this.updateTreeDisplay();
      }
    });

    // Enter to toggle expand/collapse
    this.screen.key(['enter'], () => {
      if (this.showProviderTree && this.flattenedNodes.length > 0) {
        const selected = this.flattenedNodes[this.selectedNodeIndex];
        if (selected) {
          this.toggleNode(selected.id);
        }
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
    this.historyBox.setScrollPerc(100);
    this.screen.render();
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
    if (this.expandedNodes.has(id)) {
      this.expandedNodes.delete(id);
    } else {
      this.expandedNodes.add(id);
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
      const marker = hasChildren ? (isExpanded ? '▼' : '▶') : ' ';

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

  public static create(options: BlessedTuiOptions) {
    return new BlessedTui(options);
  }
}
