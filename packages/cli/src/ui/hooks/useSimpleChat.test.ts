/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimpleChat } from './useSimpleChat.js';
import { createMockConfig } from '../test-utils.tsx';

describe('useSimpleChat', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;
  let mockGeminiClient: any;

  beforeEach(() => {
    mockConfig = createMockConfig();

    mockGeminiClient = {
      sendMessage: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
    };

    mockConfig.getGeminiClient = vi.fn().mockReturnValue(mockGeminiClient);
  });

  it('returns sendMessage function', () => {
    const { result } = renderHook(() => useSimpleChat(mockConfig));

    expect(result.current).toHaveProperty('sendMessage');
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('sends message without file context successfully', async () => {
    const mockResponse = { text: 'AI response to user message' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello AI');
    });

    expect(response).toBe('AI response to user message');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello AI');
  });

  it('sends message with file context when file is provided', async () => {
    const mockResponse = { text: 'AI response about the file' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file reading
    vi.doMock('fs', () => ({
      default: {
        readFileSync: vi.fn().mockReturnValue('file content'),
      },
    }));

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Explain this file', '/path/to/file.ts');
    });

    expect(response).toBe('AI response about the file');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('File: file.ts')
    );
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('file content')
    );
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Question: Explain this file')
    );
  });

  it('handles file reading errors gracefully', async () => {
    const mockResponse = { text: 'AI response without file' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file reading to throw error
    vi.doMock('fs', () => ({
      default: {
        readFileSync: vi.fn().mockImplementation(() => {
          throw new Error('File not found');
        }),
      },
    }));

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Explain this file', '/nonexistent/file.ts');
    });

    expect(response).toBe('AI response without file');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Explain this file');
  });

  it('throws error when Gemini client is not initialized', async () => {
    mockConfig.getGeminiClient = vi.fn().mockReturnValue(null);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('AI client not initialized');
  });

  it('throws error when Gemini client is undefined', async () => {
    mockConfig.getGeminiClient = vi.fn().mockReturnValue(undefined);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('AI client not initialized');
  });

  it('handles AI response without text property', async () => {
    const mockResponse = {}; // No text property
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('handles AI response with null text', async () => {
    const mockResponse = { text: null };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('handles AI response with empty text', async () => {
    const mockResponse = { text: '' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('formats file context correctly', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file system
    const fs = await import('fs');
    vi.mocked(fs.default.readFileSync).mockReturnValue('const x = 1;');

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await act(async () => {
      await result.current.sendMessage('What does this do?', '/src/utils.ts');
    });

    const sentMessage = mockGeminiClient.sendMessage.mock.calls[0][0];
    expect(sentMessage).toContain('File: utils.ts');
    expect(sentMessage).toContain('const x = 1;');
    expect(sentMessage).toContain('Question: What does this do?');
  });

  it('handles messages with special characters', async () => {
    const mockResponse = { text: 'Response with émojis 🚀' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Message with émojis 🚀');
    });

    expect(response).toBe('Response with émojis 🚀');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Message with émojis 🚀');
  });

  it('handles very long messages', async () => {
    const longMessage = 'a'.repeat(10000);
    const mockResponse = { text: 'Response to long message' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage(longMessage);
    });

    expect(response).toBe('Response to long message');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(longMessage);
  });

  it('handles AI client sendMessage rejection', async () => {
    const error = new Error('API Error');
    mockGeminiClient.sendMessage.mockRejectedValue(error);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('API Error');
  });

  it('handles non-Error rejection from AI client', async () => {
    mockGeminiClient.sendMessage.mockRejectedValue('String error');

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('String error');
  });

  it('memoizes sendMessage function correctly', () => {
    const { result, rerender } = renderHook(() => useSimpleChat(mockConfig));

    const initialSendMessage = result.current.sendMessage;

    rerender();

    expect(result.current.sendMessage).toBe(initialSendMessage);
  });

  it('works correctly with different config instances', () => {
    const config1 = createMockConfig();
    const config2 = createMockConfig();

    const { result: result1 } = renderHook(() => useSimpleChat(config1));
    const { result: result2 } = renderHook(() => useSimpleChat(config2));

    expect(result1.current.sendMessage).toBeDefined();
    expect(result2.current.sendMessage).toBeDefined();
    expect(result1.current.sendMessage).not.toBe(result2.current.sendMessage);
  });

  it('handles null selectedFile parameter', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello', null);
    });

    expect(response).toBe('Response');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello');
  });

  it('handles undefined selectedFile parameter', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello', undefined);
    });

    expect(response).toBe('Response');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello');
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimpleChat } from './useSimpleChat.js';
import { createMockConfig } from '../test-utils.tsx';

describe('useSimpleChat', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;
  let mockGeminiClient: any;

  beforeEach(() => {
    mockConfig = createMockConfig();

    mockGeminiClient = {
      sendMessage: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
    };

    mockConfig.getGeminiClient = vi.fn().mockReturnValue(mockGeminiClient);
  });

  it('returns sendMessage function', () => {
    const { result } = renderHook(() => useSimpleChat(mockConfig));

    expect(result.current).toHaveProperty('sendMessage');
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('sends message without file context successfully', async () => {
    const mockResponse = { text: 'AI response to user message' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello AI');
    });

    expect(response).toBe('AI response to user message');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello AI');
  });

  it('sends message with file context when file is provided', async () => {
    const mockResponse = { text: 'AI response about the file' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file reading
    vi.doMock('fs', () => ({
      default: {
        readFileSync: vi.fn().mockReturnValue('file content'),
      },
    }));

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Explain this file', '/path/to/file.ts');
    });

    expect(response).toBe('AI response about the file');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('File: file.ts')
    );
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('file content')
    );
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Question: Explain this file')
    );
  });

  it('handles file reading errors gracefully', async () => {
    const mockResponse = { text: 'AI response without file' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file reading to throw error
    vi.doMock('fs', () => ({
      default: {
        readFileSync: vi.fn().mockImplementation(() => {
          throw new Error('File not found');
        }),
      },
    }));

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Explain this file', '/nonexistent/file.ts');
    });

    expect(response).toBe('AI response without file');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Explain this file');
  });

  it('throws error when Gemini client is not initialized', async () => {
    mockConfig.getGeminiClient = vi.fn().mockReturnValue(null);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('AI client not initialized');
  });

  it('throws error when Gemini client is undefined', async () => {
    mockConfig.getGeminiClient = vi.fn().mockReturnValue(undefined);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('AI client not initialized');
  });

  it('handles AI response without text property', async () => {
    const mockResponse = {}; // No text property
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('handles AI response with null text', async () => {
    const mockResponse = { text: null };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('handles AI response with empty text', async () => {
    const mockResponse = { text: '' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello');
    });

    expect(response).toBe('No response received');
  });

  it('formats file context correctly', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    // Mock file system
    const fs = await import('fs');
    vi.mocked(fs.default.readFileSync).mockReturnValue('const x = 1;');

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await act(async () => {
      await result.current.sendMessage('What does this do?', '/src/utils.ts');
    });

    const sentMessage = mockGeminiClient.sendMessage.mock.calls[0][0];
    expect(sentMessage).toContain('File: utils.ts');
    expect(sentMessage).toContain('const x = 1;');
    expect(sentMessage).toContain('Question: What does this do?');
  });

  it('handles messages with special characters', async () => {
    const mockResponse = { text: 'Response with émojis 🚀' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Message with émojis 🚀');
    });

    expect(response).toBe('Response with émojis 🚀');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Message with émojis 🚀');
  });

  it('handles very long messages', async () => {
    const longMessage = 'a'.repeat(10000);
    const mockResponse = { text: 'Response to long message' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage(longMessage);
    });

    expect(response).toBe('Response to long message');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith(longMessage);
  });

  it('handles AI client sendMessage rejection', async () => {
    const error = new Error('API Error');
    mockGeminiClient.sendMessage.mockRejectedValue(error);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('API Error');
  });

  it('handles non-Error rejection from AI client', async () => {
    mockGeminiClient.sendMessage.mockRejectedValue('String error');

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    await expect(
      act(async () => {
        await result.current.sendMessage('Hello');
      })
    ).rejects.toThrow('String error');
  });

  it('memoizes sendMessage function correctly', () => {
    const { result, rerender } = renderHook(() => useSimpleChat(mockConfig));

    const initialSendMessage = result.current.sendMessage;

    rerender();

    expect(result.current.sendMessage).toBe(initialSendMessage);
  });

  it('works correctly with different config instances', () => {
    const config1 = createMockConfig();
    const config2 = createMockConfig();

    const { result: result1 } = renderHook(() => useSimpleChat(config1));
    const { result: result2 } = renderHook(() => useSimpleChat(config2));

    expect(result1.current.sendMessage).toBeDefined();
    expect(result2.current.sendMessage).toBeDefined();
    expect(result1.current.sendMessage).not.toBe(result2.current.sendMessage);
  });

  it('handles null selectedFile parameter', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello', null);
    });

    expect(response).toBe('Response');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello');
  });

  it('handles undefined selectedFile parameter', async () => {
    const mockResponse = { text: 'Response' };
    mockGeminiClient.sendMessage.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSimpleChat(mockConfig));

    let response: string;
    await act(async () => {
      response = await result.current.sendMessage('Hello', undefined);
    });

    expect(response).toBe('Response');
    expect(mockGeminiClient.sendMessage).toHaveBeenCalledWith('Hello');
  });
});
});
