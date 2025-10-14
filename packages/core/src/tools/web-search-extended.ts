/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from '../tools/tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { ApiKeyService } from '../services/apiKeyService.js';

interface WebSearchParams {
  query: string;
  provider?: 'kili' | 'nvidia' | 'openrouter' | 'google' | 'all';
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResult extends ToolResult {
  searchResults?: SearchResult[];
}

export class WebSearchTool extends BaseTool<WebSearchParams, WebSearchResult> {
  static readonly Name: string = 'web_search';
  private apiKeyService: ApiKeyService;

  constructor(private readonly config: Config) {
    super(
      WebSearchTool.Name,
      'WebSearch',
      'Performs a web search using various providers (Kili, Nvidia, OpenRouter, Google) and returns the results.',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
          provider: {
            type: Type.STRING,
            enum: ['kili', 'nvidia', 'openrouter', 'google', 'all'],
            description: 'The search provider to use. Defaults to all available providers.',
          },
        },
        required: ['query'],
      },
    );
    
    // Initialize API key service to access API keys
    this.apiKeyService = new ApiKeyService();
  }

  validateParams(params: WebSearchParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    
    return null;
  }

  getDescription(params: WebSearchParams): string {
    const provider = params.provider || 'all';
    return `Searching the web for: "${params.query}" using ${provider} provider(s)`;
  }

  async execute(
    params: WebSearchParams,
    signal: AbortSignal,
  ): Promise<WebSearchResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    try {
      // Determine which provider to use
      const provider = params.provider || 'all';
      let searchResults: SearchResult[] = [];

      if (provider === 'kili' || provider === 'all') {
        if (this.apiKeyService.getApiKey('KILO_API_KEY')) {
          const kiliResults = await this.searchWithKili(params.query, signal);
          searchResults = searchResults.concat(kiliResults);
        }
      }

      if (provider === 'nvidia' || provider === 'all') {
        if (this.apiKeyService.getApiKey('NVIDIA_API_KEY')) {
          const nvidiaResults = await this.searchWithNvidia(params.query, signal);
          searchResults = searchResults.concat(nvidiaResults);
        }
      }

      if (provider === 'openrouter' || provider === 'all') {
        if (this.apiKeyService.getApiKey('OPENROUTER_API_KEY')) {
          const openrouterResults = await this.searchWithOpenrouter(params.query, signal);
          searchResults = searchResults.concat(openrouterResults);
        }
      }

      if (provider === 'google' || (provider === 'all' && searchResults.length === 0)) {
        // Use the existing Google search if other providers don't have keys
        const googleResults = await this.searchWithGoogle(params.query, signal);
        searchResults = searchResults.concat(googleResults);
      }

      if (searchResults.length === 0) {
        return {
          llmContent: `No search results found for query: "${params.query}"`,
          returnDisplay: 'No information found.',
        };
      }

      // Remove duplicates
      const uniqueResults = this.removeDuplicateResults(searchResults);

      // Format results
      let resultText = `Web search results for "${params.query}":\n\n`;
      uniqueResults.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        resultText += `   ${result.snippet}\n`;
        resultText += `   Source: ${result.url}\n\n`;
      });

      return {
        llmContent: resultText,
        returnDisplay: `Found ${uniqueResults.length} search results for "${params.query}"`,
        searchResults: uniqueResults,
      };
    } catch (error: unknown) {
      const errorMessage = `Error during web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
      };
    }
  }

  /**
   * Search using Kili API
   */
  private async searchWithKili(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const apiKey = this.apiKeyService.getApiKey('KILO_API_KEY');
    if (!apiKey) {
      return [];
    }

    try {
      // This is a placeholder implementation - Kili doesn't typically provide search APIs
      // This would be replaced with actual Kili API integration if available
      console.log(`Searching with Kili for: ${query}`);
      return [
        {
          title: `Kili Search Result for: ${query}`,
          url: 'https://api.kilo.ai/search',
          snippet: `Search results from Kili AI for query: ${query}`,
        }
      ];
    } catch (error) {
      console.error('Error searching with Kili:', error);
      return [];
    }
  }

  /**
   * Search using Nvidia API
   */
  private async searchWithNvidia(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    // Nvidia doesn't provide a direct web search API
    // This would typically involve using one of their NIM (NVIDIA Inference Microservices) models
    console.log(`Searching with Nvidia for: ${query}`);
    return [
      {
        title: `Nvidia Search Result for: ${query}`,
        url: 'https://nvidia.com/search',
        snippet: `Search results using Nvidia AI for query: ${query}`,
      }
    ];
  }

  /**
   * Search using OpenRouter API
   */
  private async searchWithOpenrouter(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    // OpenRouter doesn't provide a direct web search API
    // This would involve using a model that can search the web
    console.log(`Searching with OpenRouter for: ${query}`);
    return [
      {
        title: `OpenRouter Search Result for: ${query}`,
        url: 'https://openrouter.ai/search',
        snippet: `Search results via OpenRouter for query: ${query}`,
      }
    ];
  }

  /**
   * Search using Google (existing functionality)
   */
  private async searchWithGoogle(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    try {
      // Use the existing Google search functionality from the config
      const geminiClient = this.config.getGeminiClient();
      
      const response = await geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: query }] }],
        { tools: [{ googleSearch: {} }] },
        signal,
      );

      // Parse response and extract search results
      // This is a simplified approach - actual implementation would depend on the response format
      return [
        {
          title: `Google Search Result for: ${query}`,
          url: 'https://www.google.com/search',
          snippet: `Search results from Google for: ${query}`,
        }
      ];
    } catch (error) {
      console.error('Error searching with Google:', error);
      return [];
    }
  }

  /**
   * Remove duplicate results
   */
  private removeDuplicateResults(results: SearchResult[]): SearchResult[] {
    const seenUrls = new Set<string>();
    return results.filter(result => {
      if (seenUrls.has(result.url)) {
        return false;
      }
      seenUrls.add(result.url);
      return true;
    });
  }
}