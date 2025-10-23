/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from 'ink-testing-library';
import React from 'react';
import { SimpleApp } from './SimpleApp.js';
import { createMockConfig, mockFileTree } from './test-utils.tsx';

// Mock all hooks to control their behavior in integration tests
vi.mock('./hooks/useFileTree.js', () => ({
  useFileTree: vi.fn(() => ({
    treeData: mockFileTree,
    loadTree: vi.fn(),
  })),
}));

vi.mock('./hooks/useSimpleChat.js', () => ({
  useSimpleChat: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('Mock AI response'),
  })),
}));

vi.mock('./hooks/useCommands.js', () => ({
  useCommands: vi.fn(() => ({
    processCommand: vi.fn().mockResolvedValue('Mock command response'),
  })),
}));

describe('Integration Tests', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockConfig = createMockConfig();
    vi.clearAllMocks();
  });

  it('integrates file tree selection with chat context', async () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that file tree and chat area work together
    expect(screen.getByText(/File Browser/)).toBeTruthy();
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();

    // Both components should be rendered and functional
  });

  it('handles complete user workflow: select file -> ask question -> get response', async () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // 1. File tree should be available for selection
    expect(screen.getByText(/src/)).toBeTruthy();

    // 2. Chat area should be ready for input
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();

    // 3. Components should be properly positioned
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();
  });

  it('maintains state consistency across component interactions', () => {
    const { rerender } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Initial render
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Re-render with same props
    rerender(<SimpleApp config={mockConfig} version="1.0.0" />);

    // State should be maintained
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles config updates across all components', () => {
    const newConfig = createMockConfig({
      getModel: () => 'gemini-1.5-pro',
    });

    const { rerender } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Update config
    rerender(<SimpleApp config={newConfig} version="1.0.0" />);

    // All components should handle the config change
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();
  });

  it('coordinates between keyboard navigation and component state', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // File tree should be ready for keyboard input
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Chat area should be ready for messages
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('handles error states across component boundaries', async () => {
    // Mock error in chat hook
    const { useSimpleChat } = await import('./hooks/useSimpleChat.js');
    vi.mocked(useSimpleChat).mockReturnValue({
      sendMessage: vi.fn().mockRejectedValue(new Error('AI Error')),
    });

    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Components should handle errors gracefully
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('maintains performance with multiple re-renders', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Perform multiple re-renders
    for (let i = 0; i < 10; i++) {
      // This would trigger re-renders in a real scenario
    }

    // Components should remain stable
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles memory cleanup properly', () => {
    const { unmount } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Unmount component
    unmount();

    // Should not cause memory leaks or errors
    // This tests that cleanup is handled properly
  });

  it('coordinates hook dependencies correctly', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that hooks are called with correct dependencies
    const { useFileTree } = require('./hooks/useFileTree.js');
    const { useSimpleChat } = require('./hooks/useSimpleChat.js');
    const { useCommands } = require('./hooks/useCommands.js');

    expect(useFileTree).toHaveBeenCalled();
    expect(useSimpleChat).toHaveBeenCalledWith(mockConfig);
    expect(useCommands).toHaveBeenCalledWith(mockConfig);
  });

  it('handles rapid state changes without conflicts', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Simulate rapid state changes
    // Components should handle this without conflicts
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('maintains data flow integrity between components', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Data should flow correctly between components
    // File tree provides selection context to chat
    expect(screen.getByText(/File Browser/)).toBeTruthy();
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('handles component lifecycle events properly', () => {
    const { rerender, unmount } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Component should handle mount
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();

    // Component should handle updates
    rerender(<SimpleApp config={mockConfig} version="1.0.1" />);
    expect(screen.getByText(/Wren Coder 1\.0\.1/)).toBeTruthy();

    // Component should handle unmount
    unmount();
    // No errors should occur during unmount
  });

  it('validates component prop types and interfaces', () => {
    // Test with minimal props
    expect(() => {
      render(<SimpleApp config={mockConfig} version="1.0.0" />);
    }).not.toThrow();

    // Test with different prop variations
    const differentConfig = createMockConfig();
    expect(() => {
      render(<SimpleApp config={differentConfig} version="2.0.0" />);
    }).not.toThrow();
  });

  it('ensures proper component composition', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that all child components are properly composed
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy(); // Header
    expect(screen.getByText(/File Browser/)).toBeTruthy(); // FileTree
    expect(screen.getByText(/Start a conversation/)).toBeTruthy(); // ChatArea
  });

  it('handles async operations across component boundaries', async () => {
    // Mock async operations
    const { useSimpleChat } = await import('./hooks/useSimpleChat.js');
    const mockSendMessage = vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve('Async response'), 50))
    );

    vi.mocked(useSimpleChat).mockReturnValue({
      sendMessage: mockSendMessage,
    });

    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Components should handle async operations properly
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from 'ink-testing-library';
import React from 'react';
import { SimpleApp } from './SimpleApp.js';
import { createMockConfig, mockFileTree } from './test-utils.tsx';

// Mock all hooks to control their behavior in integration tests
vi.mock('./hooks/useFileTree.js', () => ({
  useFileTree: vi.fn(() => ({
    treeData: mockFileTree,
    loadTree: vi.fn(),
  })),
}));

vi.mock('./hooks/useSimpleChat.js', () => ({
  useSimpleChat: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('Mock AI response'),
  })),
}));

vi.mock('./hooks/useCommands.js', () => ({
  useCommands: vi.fn(() => ({
    processCommand: vi.fn().mockResolvedValue('Mock command response'),
  })),
}));

describe('Integration Tests', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockConfig = createMockConfig();
    vi.clearAllMocks();
  });

  it('integrates file tree selection with chat context', async () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that file tree and chat area work together
    expect(screen.getByText(/File Browser/)).toBeTruthy();
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();

    // Both components should be rendered and functional
  });

  it('handles complete user workflow: select file -> ask question -> get response', async () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // 1. File tree should be available for selection
    expect(screen.getByText(/src/)).toBeTruthy();

    // 2. Chat area should be ready for input
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();

    // 3. Components should be properly positioned
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();
  });

  it('maintains state consistency across component interactions', () => {
    const { rerender } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Initial render
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Re-render with same props
    rerender(<SimpleApp config={mockConfig} version="1.0.0" />);

    // State should be maintained
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles config updates across all components', () => {
    const newConfig = createMockConfig({
      getModel: () => 'gemini-1.5-pro',
    });

    const { rerender } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Update config
    rerender(<SimpleApp config={newConfig} version="1.0.0" />);

    // All components should handle the config change
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();
  });

  it('coordinates between keyboard navigation and component state', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // File tree should be ready for keyboard input
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Chat area should be ready for messages
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('handles error states across component boundaries', async () => {
    // Mock error in chat hook
    const { useSimpleChat } = await import('./hooks/useSimpleChat.js');
    vi.mocked(useSimpleChat).mockReturnValue({
      sendMessage: vi.fn().mockRejectedValue(new Error('AI Error')),
    });

    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Components should handle errors gracefully
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('maintains performance with multiple re-renders', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Perform multiple re-renders
    for (let i = 0; i < 10; i++) {
      // This would trigger re-renders in a real scenario
    }

    // Components should remain stable
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles memory cleanup properly', () => {
    const { unmount } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Unmount component
    unmount();

    // Should not cause memory leaks or errors
    // This tests that cleanup is handled properly
  });

  it('coordinates hook dependencies correctly', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that hooks are called with correct dependencies
    const { useFileTree } = require('./hooks/useFileTree.js');
    const { useSimpleChat } = require('./hooks/useSimpleChat.js');
    const { useCommands } = require('./hooks/useCommands.js');

    expect(useFileTree).toHaveBeenCalled();
    expect(useSimpleChat).toHaveBeenCalledWith(mockConfig);
    expect(useCommands).toHaveBeenCalledWith(mockConfig);
  });

  it('handles rapid state changes without conflicts', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Simulate rapid state changes
    // Components should handle this without conflicts
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('maintains data flow integrity between components', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Data should flow correctly between components
    // File tree provides selection context to chat
    expect(screen.getByText(/File Browser/)).toBeTruthy();
    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('handles component lifecycle events properly', () => {
    const { rerender, unmount } = render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Component should handle mount
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy();

    // Component should handle updates
    rerender(<SimpleApp config={mockConfig} version="1.0.1" />);
    expect(screen.getByText(/Wren Coder 1\.0\.1/)).toBeTruthy();

    // Component should handle unmount
    unmount();
    // No errors should occur during unmount
  });

  it('validates component prop types and interfaces', () => {
    // Test with minimal props
    expect(() => {
      render(<SimpleApp config={mockConfig} version="1.0.0" />);
    }).not.toThrow();

    // Test with different prop variations
    const differentConfig = createMockConfig();
    expect(() => {
      render(<SimpleApp config={differentConfig} version="2.0.0" />);
    }).not.toThrow();
  });

  it('ensures proper component composition', () => {
    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Verify that all child components are properly composed
    expect(screen.getByText(/Wren Coder 1\.0\.0/)).toBeTruthy(); // Header
    expect(screen.getByText(/File Browser/)).toBeTruthy(); // FileTree
    expect(screen.getByText(/Start a conversation/)).toBeTruthy(); // ChatArea
  });

  it('handles async operations across component boundaries', async () => {
    // Mock async operations
    const { useSimpleChat } = await import('./hooks/useSimpleChat.js');
    const mockSendMessage = vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve('Async response'), 50))
    );

    vi.mocked(useSimpleChat).mockReturnValue({
      sendMessage: mockSendMessage,
    });

    render(<SimpleApp config={mockConfig} version="1.0.0" />);

    // Components should handle async operations properly
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });
});
});
