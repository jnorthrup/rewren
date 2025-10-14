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

// Define search result interface
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchParams {
  query: string;
  provider: 'kili' | 'nvidia' | 'openrouter' | 'google';
}

interface WebSearchResult extends ToolResult {
  searchResults?: SearchResult[];
}

export class KiliWebSearchTool extends BaseTool<WebSearchParams, WebSearchResult> {
  static readonly Name: string = 'kili_web_search';
  private apiKeyService: ApiKeyService;

  constructor(private readonly config: Config) {
    super(
      KiliWebSearchTool.Name,
      'KiliWebSearch',
      'Performs a web search using Kili provider and returns the results.',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
          provider: {
            type: Type.STRING,
            enum: ['kili'],
            description: 'The search provider to use (kili).',
          },
        },
        required: ['query', 'provider'],
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
    
    if (params.provider !== 'kili') {
      return "Provider must be 'kili'.";
    }
    
    return null;
  }

  getDescription(params: WebSearchParams): string {
    return `Searching the web for: "${params.query}" using Kili provider`;
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
      const apiKey = this.apiKeyService.getApiKey('KILO_API_KEY');
      if (!apiKey) {
        return {
          llmContent: 'Error: KILO_API_KEY not found in configuration or environment.',
          returnDisplay: 'Kilo API key not configured.',
        };
      }

      // In a real implementation, we would call the Kilo API here
      // For now, we'll return mock results since Kilo doesn't provide a web search API
      console.log(`Kilo search not implemented - Kilo API doesn't provide web search`);
      
      return {
        llmContent: `Kilo does not provide a web search API. Query: "${params.query}"`,
        returnDisplay: 'Kilo does not support web search.',
      };
    } catch (error: unknown) {
      const errorMessage = `Error during Kilo web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing Kilo web search.`,
      };
    }
  }
}

export class NvidiaWebSearchTool extends BaseTool<WebSearchParams, WebSearchResult> {
  static readonly Name: string = 'nvidia_web_search';
  private apiKeyService: ApiKeyService;

  constructor(private readonly config: Config) {
    super(
      NvidiaWebSearchTool.Name,
      'NvidiaWebSearch',
      'Performs a web search using Nvidia provider and returns the results.',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
          provider: {
            type: Type.STRING,
            enum: ['nvidia'],
            description: 'The search provider to use (nvidia).',
          },
        },
        required: ['query', 'provider'],
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
    
    if (params.provider !== 'nvidia') {
      return "Provider must be 'nvidia'.";
    }
    
    return null;
  }

  getDescription(params: WebSearchParams): string {
    return `Searching the web for: "${params.query}" using Nvidia provider`;
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
      const apiKey = this.apiKeyService.getApiKey('NVIDIA_API_KEY');
      if (!apiKey) {
        return {
          llmContent: 'Error: NVIDIA_API_KEY not found in configuration or environment.',
          returnDisplay: 'Nvidia API key not configured.',
        };
      }

      // For now, we'll return mock results since Nvidia doesn't provide a direct web search API
      // In reality, you'd use one of their NIM models that can access the web
      console.log(`Nvidia search - would use Nvidia NIM model with web access`);
      
      return {
        llmContent: `Nvidia does not directly provide web search API. Using Nvidia model for: "${params.query}"`,
        returnDisplay: 'Nvidia does not support direct web search.',
      };
    } catch (error: unknown) {
      const errorMessage = `Error during Nvidia web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing Nvidia web search.`,
      };
    }
  }
}

export class OpenRouterWebSearchTool extends BaseTool<WebSearchParams, WebSearchResult> {
  static readonly Name: string = 'openrouter_web_search';
  private apiKeyService: ApiKeyService;

  constructor(private readonly config: Config) {
    super(
      OpenRouterWebSearchTool.Name,
      'OpenRouterWebSearch',
      'Performs a web search using OpenRouter provider and returns the results.',
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The search query to find information on the web.',
          },
          provider: {
            type: Type.STRING,
            enum: ['openrouter'],
            description: 'The search provider to use (openrouter).',
          },
        },
        required: ['query', 'provider'],
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
    
    if (params.provider !== 'openrouter') {
      return "Provider must be 'openrouter'.";
    }
    
    return null;
  }

  getDescription(params: WebSearchParams): string {
    return `Searching the web for: "${params.query}" using OpenRouter provider`;
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
      const apiKey = this.apiKeyService.getApiKey('OPENROUTER_API_KEY');
      if (!apiKey) {
        return {
          llmContent: 'Error: OPENROUTER_API_KEY not found in configuration or environment.',
          returnDisplay: 'OpenRouter API key not configured.',
        };
      }

      // OpenRouter doesn't provide a direct web search API
      // But you can use models that have web access capabilities
      console.log(`OpenRouter search - would use web-enabled model like Perplexity or similar`);
      
      return {
        llmContent: `OpenRouter does not directly provide web search API. Using web-enabled model for: "${params.query}"`,
        returnDisplay: 'OpenRouter does not support direct web search.',
      };
    } catch (error: unknown) {
      const errorMessage = `Error during OpenRouter web search for query "${params.query}": ${getErrorMessage(error)}`;
      console.error(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing OpenRouter web search.`,
      };
    }
  }
}