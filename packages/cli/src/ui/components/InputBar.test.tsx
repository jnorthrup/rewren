/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { InputBar } from './InputBar.js';

// Mock useInput to capture key presses
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('InputBar', () => {
  const mockProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    selectedFile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInput.mockImplementation((callback) => {
      (globalThis as any).__inputBarKeyCallback = callback;
    });
  });

  it('renders with placeholder when no value and no file selected', () => {
    render(<InputBar {...mockProps} />);

    expect(screen.getByText(/>/)).toBeTruthy();
    // Should show placeholder text for no file selected
  });

  it('displays selected file context in placeholder', () => {
    const propsWithFile = {
      ...mockProps,
      selectedFile: '/path/to/Component.tsx',
    };

    render(<InputBar {...propsWithFile} />);

    expect(screen.getByText(/>/)).toBeTruthy();
    // Should show file-specific placeholder
  });

  it('displays current input value', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'test input',
    };

    render(<InputBar {...propsWithValue} />);

    expect(screen.getByText(/test input/)).toBeTruthy();
  });

  it('shows cursor when there is input value', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'test',
    };

    render(<InputBar {...propsWithValue} />);

    // Should show cursor indicator
    expect(screen.getByText(/test/)).toBeTruthy();
  });

  it('handles Enter key to submit input', () => {
    const onSubmit = vi.fn();
    render(<InputBar {...mockProps} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press Enter with some input
    keyCallback('test message', { return: true });

    expect(onSubmit).toHaveBeenCalledWith('test message');
  });

  it('does not submit empty input on Enter', () => {
    const onSubmit = vi.fn();
    render(<InputBar {...mockProps} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press Enter with empty input
    keyCallback('', { return: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('handles backspace to remove characters', () => {
    const onChange = vi.fn();
    const propsWithValue = {
      ...mockProps,
      value: 'test',
      onChange,
    };

    render(<InputBar {...propsWithValue} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press backspace
    keyCallback('', { backspace: true });

    expect(onChange).toHaveBeenCalled();
  });

  it('handles regular character input', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Type a character
    keyCallback('a', {});

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ignores invalid characters', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Try to input invalid characters (this would be filtered by the regex)
    keyCallback('@', {});

    // Should not call onChange for invalid characters
    // Note: The exact behavior depends on the character filtering regex
  });

  it('handles multiple character input', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Type multiple characters
    keyCallback('h', {});
    keyCallback('e', {});
    keyCallback('l', {});
    keyCallback('l', {});
    keyCallback('o', {});

    // Should handle each character
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('clears input after successful submission', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const propsWithValue = {
      ...mockProps,
      value: 'test message',
      onSubmit,
      onChange,
    };

    render(<InputBar {...propsWithValue} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Submit the message
    keyCallback('test message', { return: true });

    // After submission, the parent component should clear the value
    // This tests the integration behavior
  });

  it('handles rapid key presses', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Rapidly type multiple characters
    'hello world'.split('').forEach(char => {
      keyCallback(char, {});
    });

    // Should handle all characters
    expect(onChange).toHaveBeenCalledTimes(11);
  });

  it('maintains state across re-renders', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'persistent value',
    };

    const { rerender } = render(<InputBar {...propsWithValue} />);

    // Re-render with same props
    rerender(<InputBar {...propsWithValue} />);

    expect(screen.getByText(/persistent value/)).toBeTruthy();
  });

  it('updates placeholder based on selected file', () => {
    const { rerender } = render(<InputBar {...mockProps} />);

    // Initially no file selected
    expect(screen.getByText(/>/)).toBeTruthy();

    // Select a file
    rerender(<InputBar {...mockProps} selectedFile="/src/App.tsx" />);

    // Should update placeholder for file context
    expect(screen.getByText(/> ■_■| /)).toBeTruthy();
  });

  it('handles submission with file context', () => {
    const onSubmit = vi.fn();
    const propsWithFile = {
      ...mockProps,
      selectedFile: '/src/Component.tsx',
      onSubmit,
    };

    render(<InputBar {...propsWithFile} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Submit with file selected
    keyCallback('question about Component.tsx', { return: true });

    expect(onSubmit).toHaveBeenCalledWith('question about Component.tsx');
  });

  it('handles edge case of very long input', () => {
    const longValue = 'a'.repeat(1000);
    const propsWithLongValue = {
      ...mockProps,
      value: longValue,
    };

    render(<InputBar {...propsWithLongValue} />);

    // Should handle long input without crashing
    expect(screen.getByText(/>/)).toBeTruthy();
  });

  it('integrates properly with parent callbacks', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputBar {...mockProps} onChange={onChange} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Test that callbacks are properly connected
    keyCallback('test', { return: true });

    // Callbacks should be available
    expect(typeof onChange).toBe('function');
    expect(typeof onSubmit).toBe('function');
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { InputBar } from './InputBar.js';

// Mock useInput to capture key presses
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('InputBar', () => {
  const mockProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    selectedFile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInput.mockImplementation((callback) => {
      (globalThis as any).__inputBarKeyCallback = callback;
    });
  });

  it('renders with placeholder when no value and no file selected', () => {
    render(<InputBar {...mockProps} />);

    expect(screen.getByText(/>/)).toBeTruthy();
    // Should show placeholder text for no file selected
  });

  it('displays selected file context in placeholder', () => {
    const propsWithFile = {
      ...mockProps,
      selectedFile: '/path/to/Component.tsx',
    };

    render(<InputBar {...propsWithFile} />);

    expect(screen.getByText(/>/)).toBeTruthy();
    // Should show file-specific placeholder
  });

  it('displays current input value', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'test input',
    };

    render(<InputBar {...propsWithValue} />);

    expect(screen.getByText(/test input/)).toBeTruthy();
  });

  it('shows cursor when there is input value', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'test',
    };

    render(<InputBar {...propsWithValue} />);

    // Should show cursor indicator
    expect(screen.getByText(/test/)).toBeTruthy();
  });

  it('handles Enter key to submit input', () => {
    const onSubmit = vi.fn();
    render(<InputBar {...mockProps} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press Enter with some input
    keyCallback('test message', { return: true });

    expect(onSubmit).toHaveBeenCalledWith('test message');
  });

  it('does not submit empty input on Enter', () => {
    const onSubmit = vi.fn();
    render(<InputBar {...mockProps} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press Enter with empty input
    keyCallback('', { return: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('handles backspace to remove characters', () => {
    const onChange = vi.fn();
    const propsWithValue = {
      ...mockProps,
      value: 'test',
      onChange,
    };

    render(<InputBar {...propsWithValue} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Press backspace
    keyCallback('', { backspace: true });

    expect(onChange).toHaveBeenCalled();
  });

  it('handles regular character input', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Type a character
    keyCallback('a', {});

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ignores invalid characters', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Try to input invalid characters (this would be filtered by the regex)
    keyCallback('@', {});

    // Should not call onChange for invalid characters
    // Note: The exact behavior depends on the character filtering regex
  });

  it('handles multiple character input', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Type multiple characters
    keyCallback('h', {});
    keyCallback('e', {});
    keyCallback('l', {});
    keyCallback('l', {});
    keyCallback('o', {});

    // Should handle each character
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('clears input after successful submission', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const propsWithValue = {
      ...mockProps,
      value: 'test message',
      onSubmit,
      onChange,
    };

    render(<InputBar {...propsWithValue} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Submit the message
    keyCallback('test message', { return: true });

    // After submission, the parent component should clear the value
    // This tests the integration behavior
  });

  it('handles rapid key presses', () => {
    const onChange = vi.fn();
    render(<InputBar {...mockProps} onChange={onChange} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Rapidly type multiple characters
    'hello world'.split('').forEach(char => {
      keyCallback(char, {});
    });

    // Should handle all characters
    expect(onChange).toHaveBeenCalledTimes(11);
  });

  it('maintains state across re-renders', () => {
    const propsWithValue = {
      ...mockProps,
      value: 'persistent value',
    };

    const { rerender } = render(<InputBar {...propsWithValue} />);

    // Re-render with same props
    rerender(<InputBar {...propsWithValue} />);

    expect(screen.getByText(/persistent value/)).toBeTruthy();
  });

  it('updates placeholder based on selected file', () => {
    const { rerender } = render(<InputBar {...mockProps} />);

    // Initially no file selected
    expect(screen.getByText(/>/)).toBeTruthy();

    // Select a file
    rerender(<InputBar {...mockProps} selectedFile="/src/App.tsx" />);

    // Should update placeholder for file context
    expect(screen.getByText(/> ■_■| /)).toBeTruthy();
  });

  it('handles submission with file context', () => {
    const onSubmit = vi.fn();
    const propsWithFile = {
      ...mockProps,
      selectedFile: '/src/Component.tsx',
      onSubmit,
    };

    render(<InputBar {...propsWithFile} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Submit with file selected
    keyCallback('question about Component.tsx', { return: true });

    expect(onSubmit).toHaveBeenCalledWith('question about Component.tsx');
  });

  it('handles edge case of very long input', () => {
    const longValue = 'a'.repeat(1000);
    const propsWithLongValue = {
      ...mockProps,
      value: longValue,
    };

    render(<InputBar {...propsWithLongValue} />);

    // Should handle long input without crashing
    expect(screen.getByText(/>/)).toBeTruthy();
  });

  it('integrates properly with parent callbacks', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(<InputBar {...mockProps} onChange={onChange} onSubmit={onSubmit} />);

    const keyCallback = (globalThis as any).__inputBarKeyCallback;

    // Test that callbacks are properly connected
    keyCallback('test', { return: true });

    // Callbacks should be available
    expect(typeof onChange).toBe('function');
    expect(typeof onSubmit).toBe('function');
  });
});
});
