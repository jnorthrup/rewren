/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommands } from './useCommands.js';
import { createMockConfig } from '../test-utils.tsx';

describe('useCommands', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockConfig = createMockConfig();
  });

  it('returns processCommand function', () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    expect(result.current).toHaveProperty('processCommand');
    expect(typeof result.current.processCommand).toBe('function');
  });

  it('handles /help command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/help');
    });

    expect(response).toContain('Available commands:');
    expect(response).toContain('/help');
    expect(response).toContain('/auth');
    expect(response).toContain('/model');
    expect(response).toContain('/quit');
    expect(response).toContain('/clear');
  });

  it('handles /quit command correctly', async () => {
    // Mock process.exit to prevent actual exit in tests
    const mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit);

    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/quit');
    });

    expect(mockExit).toHaveBeenCalledWith(0);
    expect(response).toBeNull();
  });

  it('handles /clear command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/clear');
    });

    expect(response).toContain('Please restart the application');
  });

  it('handles /auth command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/auth');
    });

    expect(response).toContain('Authentication:');
    expect(response).toContain('Authenticated');
    expect(response).toContain('API key');
    expect(response).toContain('aistudio.google.com');
  });

  it('handles /model command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/model');
    });

    expect(response).toContain('Current model:');
    expect(response).toContain('gemini-1.5-flash');
    expect(response).toContain('gemini-1.5-pro');
    expect(response).toContain('gemini-1.0-pro');
  });

  it('handles unknown commands correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/unknown');
    });

    expect(response).toContain('Unknown command: /unknown');
    expect(response).toContain('Type /help to see available commands');
  });

  it('handles commands with arguments', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/model list');
    });

    // Should still work with extra arguments
    expect(response).toContain('Current model:');
  });

  it('handles empty command gracefully', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/');
    });

    expect(response).toContain('Unknown command');
  });

  it('handles commands with extra whitespace', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('  /help  ');
    });

    expect(response).toContain('Available commands:');
  });

  it('memoizes processCommand function correctly', () => {
    const { result, rerender } = renderHook(() => useCommands(mockConfig));

    const initialProcessCommand = result.current.processCommand;

    rerender();

    expect(result.current.processCommand).toBe(initialProcessCommand);
  });

  it('works correctly with different config instances', () => {
    const config1 = createMockConfig();
    const config2 = createMockConfig();

    const { result: result1 } = renderHook(() => useCommands(config1));
    const { result: result2 } = renderHook(() => useCommands(config2));

    expect(result1.current.processCommand).toBeDefined();
    expect(result2.current.processCommand).toBeDefined();
    expect(result1.current.processCommand).not.toBe(result2.current.processCommand);
  });

  it('returns consistent response format', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const helpResponse = await act(async () => {
      return await result.current.processCommand('/help');
    });

    const authResponse = await act(async () => {
      return await result.current.processCommand('/auth');
    });

    expect(typeof helpResponse).toBe('string');
    expect(typeof authResponse).toBe('string');
    expect(helpResponse!.length).toBeGreaterThan(0);
    expect(authResponse!.length).toBeGreaterThan(0);
  });

  it('handles rapid command processing', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const commands = ['/help', '/auth', '/model', '/help'];

    const responses = await Promise.all(
      commands.map(cmd => act(async () => {
        return await result.current.processCommand(cmd);
      }))
    );

    expect(responses).toHaveLength(4);
    responses.forEach(response => {
      expect(typeof response).toBe('string');
      expect(response!.length).toBeGreaterThan(0);
    });
  });

  it('maintains command state across multiple calls', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    // Call help multiple times
    const response1 = await act(async () => {
      return await result.current.processCommand('/help');
    });

    const response2 = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(response1).toBe(response2);
  });

  it('handles case-sensitive commands correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    // Test uppercase command
    const response = await act(async () => {
      return await result.current.processCommand('/HELP');
    });

    expect(response).toContain('Unknown command: /HELP');
  });

  it('provides helpful error messages for typos', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const response = await act(async () => {
      return await result.current.processCommand('/hepl'); // typo
    });

    expect(response).toContain('Unknown command: /hepl');
    expect(response).toContain('/help');
  });

  it('includes usage instructions in help', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const response = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(response).toContain('Usage:');
    expect(response).toContain('Type normally to chat');
    expect(response).toContain('use /command for actions');
    expect(response).toContain('Tab to navigate files');
  });

  it('returns null only for quit command', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const quitResponse = await act(async () => {
      return await result.current.processCommand('/quit');
    });

    const helpResponse = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(quitResponse).toBeNull();
    expect(helpResponse).not.toBeNull();
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommands } from './useCommands.js';
import { createMockConfig } from '../test-utils.tsx';

describe('useCommands', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockConfig = createMockConfig();
  });

  it('returns processCommand function', () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    expect(result.current).toHaveProperty('processCommand');
    expect(typeof result.current.processCommand).toBe('function');
  });

  it('handles /help command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/help');
    });

    expect(response).toContain('Available commands:');
    expect(response).toContain('/help');
    expect(response).toContain('/auth');
    expect(response).toContain('/model');
    expect(response).toContain('/quit');
    expect(response).toContain('/clear');
  });

  it('handles /quit command correctly', async () => {
    // Mock process.exit to prevent actual exit in tests
    const mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit);

    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/quit');
    });

    expect(mockExit).toHaveBeenCalledWith(0);
    expect(response).toBeNull();
  });

  it('handles /clear command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/clear');
    });

    expect(response).toContain('Please restart the application');
  });

  it('handles /auth command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/auth');
    });

    expect(response).toContain('Authentication:');
    expect(response).toContain('Authenticated');
    expect(response).toContain('API key');
    expect(response).toContain('aistudio.google.com');
  });

  it('handles /model command correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/model');
    });

    expect(response).toContain('Current model:');
    expect(response).toContain('gemini-1.5-flash');
    expect(response).toContain('gemini-1.5-pro');
    expect(response).toContain('gemini-1.0-pro');
  });

  it('handles unknown commands correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/unknown');
    });

    expect(response).toContain('Unknown command: /unknown');
    expect(response).toContain('Type /help to see available commands');
  });

  it('handles commands with arguments', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/model list');
    });

    // Should still work with extra arguments
    expect(response).toContain('Current model:');
  });

  it('handles empty command gracefully', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('/');
    });

    expect(response).toContain('Unknown command');
  });

  it('handles commands with extra whitespace', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    let response: string | null;
    await act(async () => {
      response = await result.current.processCommand('  /help  ');
    });

    expect(response).toContain('Available commands:');
  });

  it('memoizes processCommand function correctly', () => {
    const { result, rerender } = renderHook(() => useCommands(mockConfig));

    const initialProcessCommand = result.current.processCommand;

    rerender();

    expect(result.current.processCommand).toBe(initialProcessCommand);
  });

  it('works correctly with different config instances', () => {
    const config1 = createMockConfig();
    const config2 = createMockConfig();

    const { result: result1 } = renderHook(() => useCommands(config1));
    const { result: result2 } = renderHook(() => useCommands(config2));

    expect(result1.current.processCommand).toBeDefined();
    expect(result2.current.processCommand).toBeDefined();
    expect(result1.current.processCommand).not.toBe(result2.current.processCommand);
  });

  it('returns consistent response format', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const helpResponse = await act(async () => {
      return await result.current.processCommand('/help');
    });

    const authResponse = await act(async () => {
      return await result.current.processCommand('/auth');
    });

    expect(typeof helpResponse).toBe('string');
    expect(typeof authResponse).toBe('string');
    expect(helpResponse!.length).toBeGreaterThan(0);
    expect(authResponse!.length).toBeGreaterThan(0);
  });

  it('handles rapid command processing', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const commands = ['/help', '/auth', '/model', '/help'];

    const responses = await Promise.all(
      commands.map(cmd => act(async () => {
        return await result.current.processCommand(cmd);
      }))
    );

    expect(responses).toHaveLength(4);
    responses.forEach(response => {
      expect(typeof response).toBe('string');
      expect(response!.length).toBeGreaterThan(0);
    });
  });

  it('maintains command state across multiple calls', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    // Call help multiple times
    const response1 = await act(async () => {
      return await result.current.processCommand('/help');
    });

    const response2 = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(response1).toBe(response2);
  });

  it('handles case-sensitive commands correctly', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    // Test uppercase command
    const response = await act(async () => {
      return await result.current.processCommand('/HELP');
    });

    expect(response).toContain('Unknown command: /HELP');
  });

  it('provides helpful error messages for typos', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const response = await act(async () => {
      return await result.current.processCommand('/hepl'); // typo
    });

    expect(response).toContain('Unknown command: /hepl');
    expect(response).toContain('/help');
  });

  it('includes usage instructions in help', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const response = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(response).toContain('Usage:');
    expect(response).toContain('Type normally to chat');
    expect(response).toContain('use /command for actions');
    expect(response).toContain('Tab to navigate files');
  });

  it('returns null only for quit command', async () => {
    const { result } = renderHook(() => useCommands(mockConfig));

    const quitResponse = await act(async () => {
      return await result.current.processCommand('/quit');
    });

    const helpResponse = await act(async () => {
      return await result.current.processCommand('/help');
    });

    expect(quitResponse).toBeNull();
    expect(helpResponse).not.toBeNull();
  });
});
});
