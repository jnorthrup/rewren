/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Blessed from 'blessed';
import { Config } from '@wren-coder/wren-coder-cli-core';
import { LoadedSettings } from '../config/settings.js';

interface TuiAppOptions {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
}

class TuiApp {
  private screen!: Blessed.Widgets.Screen;
  private header!: Blessed.Widgets.BoxElement;
  private historyBox!: Blessed.Widgets.BoxElement;
  private inputBox!: Blessed.Widgets.BoxElement;
  private footer!: Blessed.Widgets.BoxElement;
  private statusLine!: Blessed.Widgets.BoxElement;
  private inputField!: Blessed.Widgets.TextboxElement;
  private config: Config;
  private settings: LoadedSettings;
  private version: string;
  private startupWarnings: string[];
  private isProcessing: boolean = false;

  constructor(options: TuiAppOptions) {
    this.config = options.config;
    this.settings = options.settings;
    this.startupWarnings = options.startupWarnings || [];
    this.version = options.version;
    
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
      ignoreDockContrast: true
    });

    // Handle exit
    this.screen.key(['C-c'], () => {
      this.screen.destroy();
      process.exit(0);
    });
  }

  private setupLayout() {
    // Header
    this.header = Blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 'shrink',
      content: `{bold}Wren Coder v${this.version}{/bold} - ${this.config.getTargetDir()}`,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: '#f0f0f0'
        }
      }
    });

    // History area (main content)
    this.historyBox = Blessed.box({
      top: 1,
      left: 0,
      width: '100%',
      height: 'shrink', // Will be calculated dynamically
      scrollable: true,
      alwaysScroll: true,
      scrollOnInput: true,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: '#555'
        }
      }
    });

    // Input field
    this.inputField = Blessed.textbox({
      top: '100%-4', // Position from bottom
      left: 0,
      width: '100%',
      height: 1,
      inputOnFocus: true,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'black',
          bg: 'white'
        }
      }
    });

    // Status line
    this.statusLine = Blessed.box({
      top: '100%-3',
      left: 0,
      width: '100%',
      height: 1,
      content: `{grey-fg}Model: ${this.config.getModel()} | Dir: ${this.config.getTargetDir()}{/grey-fg}`,
      tags: true,
      style: {
        fg: 'grey',
        bg: 'black'
      }
    });

    // Footer
    this.footer = Blessed.box({
      top: '100%-2',
      left: 0,
      width: '100%',
      height: 1,
      content: '{grey-fg}Press Ctrl+C to exit{/grey-fg}',
      tags: true,
      style: {
        fg: 'grey',
        bg: 'blue'
      }
    });

    // Add all elements to screen
    this.screen.append(this.header);
    this.screen.append(this.historyBox);
    this.screen.append(this.inputField);
    this.screen.append(this.statusLine);
    this.screen.append(this.footer);

    // Focus the input field
    this.inputField.focus();
  }

  private setupEventHandlers() {
    // Handle input submission
    this.inputField.on('submit', (value: string) => {
      if (value.trim()) {
        this.handleInput(value.trim());
        this.inputField.clearValue();
        this.screen.render();
      }
    });

    // Handle tab for autocompletion (placeholder)
    this.inputField.key(['tab'], () => {
      // Placeholder for tab completion
    });
  }

  private async start() {
    // Display startup warnings if any
    if (this.startupWarnings.length > 0) {
      for (const warning of this.startupWarnings) {
        this.addMessage('warning', warning);
      }
    }

    // Display initial prompt if provided
    const initialPrompt = this.config.getQuestion();
    if (initialPrompt) {
      setImmediate(() => {
        this.handleInput(initialPrompt);
      });
    }

    // Render screen
    this.screen.render();
  }

  private async handleInput(input: string) {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Add user message to history
    this.addMessage('user', `> ${input}`);

    try {
      // Check if it's a slash command
      if (input.startsWith('/')) {
        await this.handleSlashCommand(input);
      } else {
        // Process as regular query
        await this.processQuery(input);
      }
    } catch (error) {
      this.addMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleSlashCommand(input: string) {
    // For now, just show that we're processing a command
    this.addMessage('info', `Processing command: ${input}`);
    
    // In a real implementation, you would use the actual slash command processor
    // For now, just add a placeholder response
    switch (input) {
      case '/help':
        this.addMessage('info', 'Available commands: /help, /clear, /quit, /exit');
        break;
      case '/clear':
        this.historyBox.setContent('');
        this.screen.render();
        this.addMessage('info', 'History cleared');
        break;
      case '/quit':
      case '/exit':
        this.screen.destroy();
        process.exit(0);
        break;
      default:
        this.addMessage('info', `Unknown command: ${input}. Type /help for available commands.`);
    }
  }

  private async processQuery(query: string) {
    try {
      // Show processing indicator
      this.addMessage('info', 'Processing query...');
      
      // Access the gemini client from config to process the query
      const geminiClient = this.config.getGeminiClient();
      
      if (geminiClient && typeof geminiClient.sendMessageStream !== 'undefined') {
        // Create abort controller for the request
        const abortController = new AbortController();
        
        // Generate a random prompt ID
        const prompt_id = Math.random().toString(16).slice(2);
        
        // Use the streaming method to get the response
        const stream = geminiClient.sendMessageStream(query, abortController.signal, prompt_id);
        
        // Collect the response parts
        let fullResponse = '';
        for await (const chunk of stream) {
          // The chunk could be different types, we need to handle appropriately
          // Check the structure of the chunk
          if (typeof chunk === 'object' && chunk !== null) {
            if ('text' in chunk) {
              const text = chunk.text;
              if (typeof text === 'string') {
                fullResponse += text;
              }
            } else if ('parts' in chunk) {
              // Handle parts-based response
              const parts = chunk.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (typeof part === 'object' && part !== null && 'text' in part) {
                    const text = part.text;
                    if (typeof text === 'string') {
                      fullResponse += text;
                    }
                  }
                }
              }
            }
          } else if (typeof chunk === 'string') {
            fullResponse += chunk;
          }
        }
        
        if (fullResponse) {
          this.addMessage('assistant', fullResponse);
          this.addMessage('info', 'Query processed successfully');
        } else {
          this.addMessage('error', 'Received empty response from AI service');
        }
      } else {
        this.addMessage('error', 'No AI client available');
      }
    } catch (error) {
      this.addMessage('error', `Error processing query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public addMessage(type: string, content: string) {
    const timestamp = new Date().toLocaleTimeString();
    let formattedContent = '';

    switch (type) {
      case 'user':
        formattedContent = `{bold}{blue-fg}[${timestamp}]{/blue-fg}{/bold} {white-fg}${content}{/white-fg}`;
        break;
      case 'assistant':
        formattedContent = `{bold}{green-fg}[${timestamp}]{/green-fg}{/bold} {green-fg}${content}{/green-fg}`;
        break;
      case 'info':
        formattedContent = `{bold}{yellow-fg}[${timestamp}]{/yellow-fg}{/bold} {yellow-fg}${content}{/yellow-fg}`;
        break;
      case 'error':
        formattedContent = `{bold}{red-fg}[${timestamp}]{/red-fg}{/bold} {red-fg}${content}{/red-fg}`;
        break;
      case 'warning':
        formattedContent = `{bold}{magenta-fg}[${timestamp}]{/magenta-fg}{/bold} {magenta-fg}${content}{/magenta-fg}`;
        break;
      default:
        formattedContent = `{bold}{grey-fg}[${timestamp}]{/grey-fg}{/bold} {grey-fg}${content}{/grey-fg}`;
    }

    // Add to history box
    this.historyBox.pushLine(formattedContent);
    this.historyBox.setScrollPerc(100); // Auto-scroll to bottom
    this.screen.render();
  }

  public destroy() {
    this.screen.destroy();
  }

  public static create(options: TuiAppOptions) {
    return new TuiApp(options);
  }
}

export { TuiApp };