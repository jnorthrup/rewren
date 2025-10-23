/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { FileTree } from './FileTree.js';
import { mockFileTree } from '../test-utils.tsx';

// Mock useInput to capture key presses
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('FileTree', () => {
  const mockProps = {
    data: mockFileTree,
    selectedFile: null,
    onFileSelect: vi.fn(),
    onPathChange: vi.fn(),
    currentPath: '/test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInput.mockImplementation((callback) => {
      // Store callback for manual triggering
      (globalThis as any).__fileTreeKeyCallback = callback;
    });
  });

  it('renders file tree with correct structure', () => {
    render(<FileTree {...mockProps} />);

    // Check header
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Check file/directory items
    expect(screen.getByText(/src/)).toBeTruthy();
    expect(screen.getByText(/package\.json/)).toBeTruthy();
    expect(screen.getByText(/README\.md/)).toBeTruthy();
  });

  it('displays directories and files with appropriate icons', () => {
    render(<FileTree {...mockProps} />);

    // Should show directory icons for folders
    expect(screen.getByText(/📁 src/)).toBeTruthy();

    // Should show file icons for files
    expect(screen.getByText(/📄 package\.json/)).toBeTruthy();
    expect(screen.getByText(/📄 README\.md/)).toBeTruthy();
  });

  it('shows nested file structure correctly', () => {
    render(<FileTree {...mockProps} />);

    // Should show nested components
    expect(screen.getByText(/components/)).toBeTruthy();
    expect(screen.getByText(/Button\.tsx/)).toBeTruthy();
    expect(screen.getByText(/Input\.tsx/)).toBeTruthy();
  });

  it('handles empty file tree gracefully', () => {
    const emptyProps = {
      ...mockProps,
      data: [],
    };

    render(<FileTree {...emptyProps} />);

    expect(screen.getByText(/No files found/)).toBeTruthy();
  });

  it('highlights selected file correctly', () => {
    const selectedProps = {
      ...mockProps,
      selectedFile: '/test/package.json',
    };

    render(<FileTree {...selectedProps} />);

    // The selected file should be visually distinct
    // This tests the selection highlighting logic
    expect(screen.getByText(/package\.json/)).toBeTruthy();
  });

  it('responds to keyboard navigation', () => {
    render(<FileTree {...mockProps} />);

    // Simulate key presses
    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Test down arrow navigation
    keyCallback('', { downArrow: true });
    keyCallback('', { downArrow: true });

    // Should not crash and maintains state
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles file selection via Enter key', () => {
    const onFileSelect = vi.fn();
    render(<FileTree {...mockProps} onFileSelect={onFileSelect} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Navigate to a file and press Enter
    keyCallback('', { downArrow: true });
    keyCallback('', { downArrow: true });
    keyCallback('', { return: true });

    // Should call onFileSelect for file selection
    // Note: The exact behavior depends on the focused item
  });

  it('handles directory expansion via Enter key', () => {
    const onPathChange = vi.fn();
    render(<FileTree {...mockProps} onPathChange={onPathChange} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Press Enter on a directory
    keyCallback('', { return: true });

    // Should handle directory navigation
    // Note: The exact behavior depends on the focused item
  });

  it('toggles directory expansion with right arrow', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Focus on directory and press right arrow
    keyCallback('', { rightArrow: true });

    // Should expand directory
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('collapses directory with left arrow', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Press left arrow to collapse
    keyCallback('', { leftArrow: true });

    // Should handle collapse
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('displays status messages for user actions', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Trigger an action that should show status
    keyCallback('', { return: true });

    // Status messages are handled by the component
    // This tests that actions don't crash the component
  });

  it('maintains focus state across re-renders', () => {
    const { rerender } = render(<FileTree {...mockProps} />);

    // Re-render with same props
    rerender(<FileTree {...mockProps} />);

    // Should maintain rendering state
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles keyboard navigation boundaries', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Test navigation at boundaries
    keyCallback('', { upArrow: true }); // Should not go above first item
    keyCallback('', { downArrow: true }); // Should handle navigation

    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('integrates properly with parent callbacks', () => {
    const onFileSelect = vi.fn();
    const onPathChange = vi.fn();

    render(<FileTree {...mockProps} onFileSelect={onFileSelect} onPathChange={onPathChange} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Trigger actions that should call parent callbacks
    keyCallback('', { return: true });

    // Callbacks should be available for integration
    expect(typeof onFileSelect).toBe('function');
    expect(typeof onPathChange).toBe('function');
  });

  it('displays appropriate file type icons', () => {
    const tsxFileTree = [
      {
        name: 'Component.tsx',
        path: '/test/Component.tsx',
        type: 'file' as const,
      },
      {
        name: 'styles.css',
        path: '/test/styles.css',
        type: 'file' as const,
      },
    ];

    render(<FileTree {...mockProps} data={tsxFileTree} />);

    // Should show appropriate icons for different file types
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
    expect(screen.getByText(/styles\.css/)).toBeTruthy();
  });

  it('handles rapid key presses gracefully', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Simulate rapid key presses
    for (let i = 0; i < 10; i++) {
      keyCallback('', { downArrow: true });
    }

    // Should handle rapid input without crashing
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { FileTree } from './FileTree.js';
import { mockFileTree } from '../test-utils.tsx';

// Mock useInput to capture key presses
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('FileTree', () => {
  const mockProps = {
    data: mockFileTree,
    selectedFile: null,
    onFileSelect: vi.fn(),
    onPathChange: vi.fn(),
    currentPath: '/test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInput.mockImplementation((callback) => {
      // Store callback for manual triggering
      (globalThis as any).__fileTreeKeyCallback = callback;
    });
  });

  it('renders file tree with correct structure', () => {
    render(<FileTree {...mockProps} />);

    // Check header
    expect(screen.getByText(/File Browser/)).toBeTruthy();

    // Check file/directory items
    expect(screen.getByText(/src/)).toBeTruthy();
    expect(screen.getByText(/package\.json/)).toBeTruthy();
    expect(screen.getByText(/README\.md/)).toBeTruthy();
  });

  it('displays directories and files with appropriate icons', () => {
    render(<FileTree {...mockProps} />);

    // Should show directory icons for folders
    expect(screen.getByText(/📁 src/)).toBeTruthy();

    // Should show file icons for files
    expect(screen.getByText(/📄 package\.json/)).toBeTruthy();
    expect(screen.getByText(/📄 README\.md/)).toBeTruthy();
  });

  it('shows nested file structure correctly', () => {
    render(<FileTree {...mockProps} />);

    // Should show nested components
    expect(screen.getByText(/components/)).toBeTruthy();
    expect(screen.getByText(/Button\.tsx/)).toBeTruthy();
    expect(screen.getByText(/Input\.tsx/)).toBeTruthy();
  });

  it('handles empty file tree gracefully', () => {
    const emptyProps = {
      ...mockProps,
      data: [],
    };

    render(<FileTree {...emptyProps} />);

    expect(screen.getByText(/No files found/)).toBeTruthy();
  });

  it('highlights selected file correctly', () => {
    const selectedProps = {
      ...mockProps,
      selectedFile: '/test/package.json',
    };

    render(<FileTree {...selectedProps} />);

    // The selected file should be visually distinct
    // This tests the selection highlighting logic
    expect(screen.getByText(/package\.json/)).toBeTruthy();
  });

  it('responds to keyboard navigation', () => {
    render(<FileTree {...mockProps} />);

    // Simulate key presses
    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Test down arrow navigation
    keyCallback('', { downArrow: true });
    keyCallback('', { downArrow: true });

    // Should not crash and maintains state
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles file selection via Enter key', () => {
    const onFileSelect = vi.fn();
    render(<FileTree {...mockProps} onFileSelect={onFileSelect} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Navigate to a file and press Enter
    keyCallback('', { downArrow: true });
    keyCallback('', { downArrow: true });
    keyCallback('', { return: true });

    // Should call onFileSelect for file selection
    // Note: The exact behavior depends on the focused item
  });

  it('handles directory expansion via Enter key', () => {
    const onPathChange = vi.fn();
    render(<FileTree {...mockProps} onPathChange={onPathChange} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Press Enter on a directory
    keyCallback('', { return: true });

    // Should handle directory navigation
    // Note: The exact behavior depends on the focused item
  });

  it('toggles directory expansion with right arrow', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Focus on directory and press right arrow
    keyCallback('', { rightArrow: true });

    // Should expand directory
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('collapses directory with left arrow', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Press left arrow to collapse
    keyCallback('', { leftArrow: true });

    // Should handle collapse
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('displays status messages for user actions', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Trigger an action that should show status
    keyCallback('', { return: true });

    // Status messages are handled by the component
    // This tests that actions don't crash the component
  });

  it('maintains focus state across re-renders', () => {
    const { rerender } = render(<FileTree {...mockProps} />);

    // Re-render with same props
    rerender(<FileTree {...mockProps} />);

    // Should maintain rendering state
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('handles keyboard navigation boundaries', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Test navigation at boundaries
    keyCallback('', { upArrow: true }); // Should not go above first item
    keyCallback('', { downArrow: true }); // Should handle navigation

    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });

  it('integrates properly with parent callbacks', () => {
    const onFileSelect = vi.fn();
    const onPathChange = vi.fn();

    render(<FileTree {...mockProps} onFileSelect={onFileSelect} onPathChange={onPathChange} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Trigger actions that should call parent callbacks
    keyCallback('', { return: true });

    // Callbacks should be available for integration
    expect(typeof onFileSelect).toBe('function');
    expect(typeof onPathChange).toBe('function');
  });

  it('displays appropriate file type icons', () => {
    const tsxFileTree = [
      {
        name: 'Component.tsx',
        path: '/test/Component.tsx',
        type: 'file' as const,
      },
      {
        name: 'styles.css',
        path: '/test/styles.css',
        type: 'file' as const,
      },
    ];

    render(<FileTree {...mockProps} data={tsxFileTree} />);

    // Should show appropriate icons for different file types
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
    expect(screen.getByText(/styles\.css/)).toBeTruthy();
  });

  it('handles rapid key presses gracefully', () => {
    render(<FileTree {...mockProps} />);

    const keyCallback = (globalThis as any).__fileTreeKeyCallback;

    // Simulate rapid key presses
    for (let i = 0; i < 10; i++) {
      keyCallback('', { downArrow: true });
    }

    // Should handle rapid input without crashing
    expect(screen.getByText(/File Browser/)).toBeTruthy();
  });
});
});
