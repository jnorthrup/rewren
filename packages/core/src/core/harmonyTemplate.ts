/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Harmony format template for multi-channel reasoning
 * This template provides the structure for models to output in Harmony format
 * with analysis, commentary, and final channels.
 */

export interface HarmonyTemplateOptions {
  // Whether to include analysis channel (reasoning)
  includeAnalysis?: boolean;
  // Whether to include commentary channel (meta-reasoning about tool usage)
  includeCommentary?: boolean;
  // Whether to include final channel (user-facing output)
  includeFinal?: boolean;
  // Maximum tokens for reasoning
  maxReasoningTokens?: number;
  // Reasoning effort level
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Whether to include reasoning in response
  includeReasoning?: boolean;
}

/**
 * A Harmony translator that intelligently handles different model types
 * - For Harmony-capable models: applies full multi-channel format
 * - For non-Harmony models: simulates Harmony format or passes through efficiently
 */
export class HarmonyTranslator {
  private options: HarmonyTemplateOptions;
  private isHarmonyModel: boolean;

  constructor(options: HarmonyTemplateOptions = {}, isHarmonyCapableModel: boolean = false) {
    this.options = {
      includeAnalysis: true,
      includeCommentary: true,
      includeFinal: true,
      maxReasoningTokens: 8192,
      reasoningEffort: 'high',
      includeReasoning: true,
      ...options
    };
    this.isHarmonyModel = isHarmonyCapableModel;
  }

  /**
   * Input transformation - adapts based on model capability
   */
  translateInput(prompt: string): string {
    if (this.isHarmonyModel) {
      // For Harmony-capable models, apply full format instructions
      const validChannels = [
        this.options.includeAnalysis ? 'analysis' : null,
        this.options.includeCommentary ? 'commentary' : null,
        this.options.includeFinal ? 'final' : null,
      ].filter(Boolean).join(', ');

      return `
# Valid channels: ${validChannels}. Channel must be included for every message.
# Reasoning: ${this.options.reasoningEffort}

# Instructions
${prompt}

# Response Format
Output in Harmony format with the following channels as appropriate:
- analysis: for reasoning and thought process
- commentary: for meta-reasoning about tools/function calls  
- final: for the final response to the user
      `.trim();
    } else {
      // For non-Harmony models, just append minimal Harmony-like instructions
      // without confusing format requirements
      return `${prompt}

# Note: Please structure your response with clear reasoning where appropriate.`;
    }
  }

  /**
   * Output transformation - processes responses from any model type
   */
  translateOutput(response: string): { analysis?: string; commentary?: string; final?: string; content: string } {
    const result: { analysis?: string; commentary?: string; final?: string; content: string } = {
      content: response
    };
    
    if (this.isHarmonyModel) {
      // For Harmony models, parse the actual channels
      const lines = response.split('\n');
      let currentSection: 'analysis' | 'commentary' | 'final' | null = null;
      let analysisContent = '';
      let commentaryContent = '';
      let finalContent = '';
      
      for (const line of lines) {
        if (line.trim().toLowerCase().startsWith('analysis:')) {
          currentSection = 'analysis';
          const content = line.substring('analysis:'.length).trim();
          if (content) analysisContent += content + '\n';
        } else if (line.trim().toLowerCase().startsWith('commentary:')) {
          currentSection = 'commentary';
          const content = line.substring('commentary:'.length).trim();
          if (content) commentaryContent += content + '\n';
        } else if (line.trim().toLowerCase().startsWith('final:')) {
          currentSection = 'final';
          const content = line.substring('final:'.length).trim();
          if (content) finalContent += content + '\n';
        } else if (currentSection) {
          switch (currentSection) {
            case 'analysis':
              analysisContent += line + '\n';
              break;
            case 'commentary':
              commentaryContent += line + '\n';
              break;
            case 'final':
              finalContent += line + '\n';
              break;
          }
        }
      }
      
      if (analysisContent.trim()) result.analysis = analysisContent.trim();
      if (commentaryContent.trim()) result.commentary = commentaryContent.trim();
      if (finalContent.trim()) result.final = finalContent.trim();
      
      if (!result.analysis && !result.commentary && !result.final) {
        result.content = response;
      }
    } else {
      // For non-Harmony models, treat entire response as final content
      result.final = response;
      result.content = response;
    }
    
    return result;
  }

  /**
   * Check if content follows Harmony format
   */
  static isHarmonyFormatted(content: string): boolean {
    return content.includes('Valid channels:') && 
           content.includes('Channel must be included');
  }
}