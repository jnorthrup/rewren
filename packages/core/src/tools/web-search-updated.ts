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
import { fetchWithTimeout } from '../utils/fetch.js';

// Define search result interface
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchParams {
  query: string;
  maxResults?: number;
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
      'Performs a web search using various providers and returns the results.',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
          maxResults: {
            type: Type.NUMBER,
            description: 'Maximum number of results to return (default: 5, max: 10).',
            minimum: 1,
            maximum: 10,
          },
        },
        required: ['query'],
      },
    );
    
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
    return `Searching the web for: "${params.query}"`;
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
      // Use Google Custom Search API if available, otherwise use DuckDuckGo
      const searchResults = await this.performSearch(params.query, params.maxResults || 5);
      
      if (searchResults.length === 0) {
        return {
          llmContent: `No search results found for query: "${params.query}"`,
          returnDisplay: 'No information found.',
        };
      }

      // Format results
      let resultText = `Web search results for "${params.query}":\n\n`;
      searchResults.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        resultText += `   ${result.snippet}\n`;
        resultText += `   Source: ${result.url}\n\n`;
      });

      return {
        llmContent: resultText,
        returnDisplay: `Found ${searchResults.length} search results for "${params.query}"`,
        searchResults,
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
   * Perform search using DuckDuckGo API (free alternative)
   */
  private async performSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    try {
      // Using DuckDuckGo Instant Answer API (free, no API key required)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
      
      const response = await fetchWithTimeout(url, 10000);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process the results
      const results: SearchResult[] = [];
      
      // Add the main result if available
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodedQuery}`,
          snippet: data.AbstractText,
        });
      }
      
      // Add related topics if available
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text,
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
      
      // Limit results to maxResults
      return results.slice(0, maxResults);
    } catch (error) {
      console.error('Error using DuckDuckGo API:', error);
      
      // Fallback to other search methods could be implemented here
      return [];
    }
  }
}