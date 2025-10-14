/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';
import { ReorgService, ReorgParameters } from '@wren-coder/wren-coder-cli-core';

export const reorgCommand: SlashCommand = {
  name: 'reorg',
  description: 'Trigger context reorganization with customizable parameters. Usage: /reorg [--max-tokens=N] [--scan-tokens=N] [--bleed] [--no-toc] [--min-importance=F] [--no-flow]',
  action: async (context, args) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const client = config.getGeminiClient();
    if (!client) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Gemini client not available',
      };
    }

    try {
      // Parse reorg parameters from args
      const params = parseReorgParameters(args);

      // Get current conversation history
      const messages = client.getHistory();

      const reorgService = new ReorgService(config);
      const result = await reorgService.reorganize({
        trigger: 'manual',
        messages,
        parameters: params,
      });

  const { dumpPath, microContext, compressedPrompt, dumpMetadata } = result;
      await client.resetChat();

      // Add the micro-context as the new starting point
      await client.addHistory({
        role: 'user',
        parts: [{ text: compressedPrompt }],
      });
      await client.addHistory({
        role: 'model',
        parts: [{ text: 'Understood. I have reassembled my context and am ready to continue with full awareness of our previous work.' }],
      });

      context.ui.setDebugMessage(`Context reorganization completed. Self-reassembled with ${microContext.estimatedTokens} token micro-context.`);

      const paramSummary = formatParameterSummary(params);
      return {
        type: 'message',
        messageType: 'info',
        content: `Context reorganization triggered successfully.\n\n` +
                 `${paramSummary}\n` +
                 `📁 Dump saved: ${dumpPath}\n` +
                 `🧠 Self-reassembled with ${microContext.estimatedTokens} token micro-context\n` +
                 `📊 Original messages: ${dumpMetadata.totalMessages}\n` +
                 `🎯 Original tokens: ${dumpMetadata.estimatedTokens}\n` +
                 `${microContext.tocIndexes ? `📚 TOC indexes: ${microContext.tocIndexes.length}\n` : ''}` +
                 `The LLM has self-reassembled from the compressed context and is ready to continue.`,
      };
    } catch (error) {
      console.error('Context reorganization failed:', error);
      return {
        type: 'message',
        messageType: 'error',
        content: `Context reorganization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Parses reorg command parameters from args string
 */
function parseReorgParameters(args: string): Partial<ReorgParameters> {
  const argArray = args.trim().split(/\s+/).filter(arg => arg.length > 0);
  const params: Partial<ReorgParameters> = {};

  for (let i = 0; i < argArray.length; i++) {
    const arg = argArray[i];

    if (arg === '--max-tokens' && i + 1 < argArray.length) {
      const value = parseInt(argArray[i + 1], 10);
      if (!isNaN(value) && value > 0) {
        params.maxMicroContextTokens = value;
        i++; // Skip next arg
      }
    } else if (arg === '--scan-tokens' && i + 1 < argArray.length) {
      const value = parseInt(argArray[i + 1], 10);
      if (!isNaN(value) && value > 0) {
        params.historyScanTokens = value;
        i++; // Skip next arg
      }
    } else if (arg === '--bleed') {
      params.bleedIntoHistory = true;
    } else if (arg === '--no-toc') {
      params.enableTocIndexing = false;
    } else if (arg === '--min-importance' && i + 1 < argArray.length) {
      const value = parseFloat(argArray[i + 1]);
      if (!isNaN(value) && value >= 0 && value <= 1) {
        params.minImportanceThreshold = value;
        i++; // Skip next arg
      }
    } else if (arg === '--no-flow') {
      params.preserveConversationFlow = false;
    }
  }

  return params;
}

/**
 * Formats parameter summary for display
 */
function formatParameterSummary(params: Partial<ReorgParameters>): string {
  const parts: string[] = [];

  if (params.maxMicroContextTokens) {
    parts.push(`🎯 Max tokens: ${params.maxMicroContextTokens}`);
  }
  if (params.historyScanTokens) {
    parts.push(`🔍 Scan tokens: ${params.historyScanTokens}`);
  }
  if (params.bleedIntoHistory) {
    parts.push(`🌊 Bleed into history: enabled`);
  }
  if (params.enableTocIndexing === false) {
    parts.push(`📚 TOC indexing: disabled`);
  }
  if (params.minImportanceThreshold !== undefined) {
    parts.push(`⚖️ Min importance: ${params.minImportanceThreshold}`);
  }
  if (params.preserveConversationFlow === false) {
    parts.push(`💬 Conversation flow: disabled`);
  }

  return parts.length > 0 ? `⚙️ Parameters: ${parts.join(', ')}\n` : '';
}

// Test function for parameter parsing (can be removed in production)
export function testReorgParameters() {
  console.log('Testing reorg parameter parsing...');

  const testCases = [
    '',
    '--max-tokens 15000',
    '--scan-tokens 30000 --bleed',
    '--no-toc --min-importance 0.5',
    '--max-tokens 10000 --scan-tokens 25000 --bleed --no-flow',
    'invalid args here',
  ];

  for (const testCase of testCases) {
    const params = parseReorgParameters(testCase);
    console.log(`Input: "${testCase}"`);
    console.log(`Parsed:`, params);
    console.log(`Summary:`, formatParameterSummary(params));
    console.log('---');
  }
}