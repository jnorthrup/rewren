/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { ChatArea } from './ChatArea.js';

describe('ChatArea', () => {
  const mockMessages = [
    {
      type: 'user' as const,
      content: 'Hello, how do I use this component?',
      timestamp: new Date('2024-01-01T10:00:00Z'),
    },
    {
      type: 'assistant' as const,
      content: 'You can use this component by importing it and passing the required props.',
      timestamp: new Date('2024-01-01T10:01:00Z'),
    },
  ];

  beforeEach(() => {
    // Clear screen between tests
  });

  it('renders empty state when no messages', () => {
    render(<ChatArea messages={[]} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('displays user and assistant messages correctly', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // Check for message content
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/You can use this component/)).toBeTruthy();

    // Check for user/assistant labels
    expect(screen.getByText(/You:/)).toBeTruthy();
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('shows timestamps for messages', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // Should display formatted timestamps
    // The exact format may vary, but timestamps should be present
    expect(screen.getByText(/10:00/)).toBeTruthy();
    expect(screen.getByText(/10:01/)).toBeTruthy();
  });

  it('displays selected file context when provided', () => {
    render(<ChatArea
      messages={[]}
      isLoading={false}
      selectedFile="/path/to/Component.tsx"
    />);

    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
  });

  it('shows loading indicator when isLoading is true', () => {
    render(<ChatArea messages={[]} isLoading={true} selectedFile={null} />);

    expect(screen.getByText(/AI is thinking/)).toBeTruthy();
  });

  it('handles multiple messages in sequence', () => {
    const manyMessages = [
      ...mockMessages,
      {
        type: 'user' as const,
        content: 'Thank you for the help!',
        timestamp: new Date('2024-01-01T10:02:00Z'),
      },
      {
        type: 'assistant' as const,
        content: 'You\'re welcome! Let me know if you need more assistance.',
        timestamp: new Date('2024-01-01T10:03:00Z'),
      },
    ];

    render(<ChatArea messages={manyMessages} isLoading={false} selectedFile={null} />);

    // Should display all messages
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/Thank you for the help!/)).toBeTruthy();
    expect(screen.getByText(/You're welcome!/)).toBeTruthy();
  });

  it('displays file context and messages together', () => {
    render(<ChatArea
      messages={mockMessages}
      isLoading={false}
      selectedFile="/src/Component.tsx"
    />);

    // Should show both file context and messages
    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
  });

  it('handles loading state with existing messages', () => {
    render(<ChatArea messages={mockMessages} isLoading={true} selectedFile={null} />);

    // Should show both messages and loading indicator
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/AI is thinking/)).toBeTruthy();
  });

  it('formats timestamps correctly', () => {
    const messagesWithRecentTimestamps = [
      {
        type: 'user' as const,
        content: 'Test message',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={messagesWithRecentTimestamps} isLoading={false} selectedFile={null} />);

    // Should display current time format
    expect(screen.getByText(/Test message/)).toBeTruthy();
  });

  it('handles messages with special characters', () => {
    const specialCharMessages = [
      {
        type: 'user' as const,
        content: 'Message with émojis 🚀 and spëcial châractérs!',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={specialCharMessages} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Message with émojis/)).toBeTruthy();
    expect(screen.getByText(/spëcial châractérs/)).toBeTruthy();
  });

  it('maintains layout integrity with long messages', () => {
    const longMessage = {
      type: 'assistant' as const,
      content: 'A'.repeat(200), // Very long message
      timestamp: new Date(),
    };

    render(<ChatArea messages={[longMessage]} isLoading={false} selectedFile={null} />);

    // Should handle long content without crashing
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('handles rapid message updates', () => {
    const { rerender } = render(<ChatArea messages={[]} isLoading={false} selectedFile={null} />);

    // Rapidly update with new messages
    rerender(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();

    // Update again quickly
    rerender(<ChatArea messages={[mockMessages[0]]} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
  });

  it('displays correct message types with proper styling', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // User messages should be distinguishable from assistant messages
    // This tests the visual differentiation logic
    expect(screen.getByText(/You:/)).toBeTruthy();
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('handles empty message content gracefully', () => {
    const emptyMessage = [
      {
        type: 'user' as const,
        content: '',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={emptyMessage} isLoading={false} selectedFile={null} />);

    // Should handle empty content without crashing
    expect(screen.getByText(/You:/)).toBeTruthy();
  });

  it('integrates properly with selected file context', () => {
    const filePath = '/very/long/path/to/deeply/nested/Component.tsx';

    render(<ChatArea messages={[]} isLoading={false} selectedFile={filePath} />);

    // Should show the file context
    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
  });
}); * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from 'ink-testing-library';
import React from 'react';
import { ChatArea } from './ChatArea.js';

describe('ChatArea', () => {
  const mockMessages = [
    {
      type: 'user' as const,
      content: 'Hello, how do I use this component?',
      timestamp: new Date('2024-01-01T10:00:00Z'),
    },
    {
      type: 'assistant' as const,
      content: 'You can use this component by importing it and passing the required props.',
      timestamp: new Date('2024-01-01T10:01:00Z'),
    },
  ];

  beforeEach(() => {
    // Clear screen between tests
  });

  it('renders empty state when no messages', () => {
    render(<ChatArea messages={[]} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Start a conversation/)).toBeTruthy();
  });

  it('displays user and assistant messages correctly', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // Check for message content
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/You can use this component/)).toBeTruthy();

    // Check for user/assistant labels
    expect(screen.getByText(/You:/)).toBeTruthy();
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('shows timestamps for messages', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // Should display formatted timestamps
    // The exact format may vary, but timestamps should be present
    expect(screen.getByText(/10:00/)).toBeTruthy();
    expect(screen.getByText(/10:01/)).toBeTruthy();
  });

  it('displays selected file context when provided', () => {
    render(<ChatArea
      messages={[]}
      isLoading={false}
      selectedFile="/path/to/Component.tsx"
    />);

    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
  });

  it('shows loading indicator when isLoading is true', () => {
    render(<ChatArea messages={[]} isLoading={true} selectedFile={null} />);

    expect(screen.getByText(/AI is thinking/)).toBeTruthy();
  });

  it('handles multiple messages in sequence', () => {
    const manyMessages = [
      ...mockMessages,
      {
        type: 'user' as const,
        content: 'Thank you for the help!',
        timestamp: new Date('2024-01-01T10:02:00Z'),
      },
      {
        type: 'assistant' as const,
        content: 'You\'re welcome! Let me know if you need more assistance.',
        timestamp: new Date('2024-01-01T10:03:00Z'),
      },
    ];

    render(<ChatArea messages={manyMessages} isLoading={false} selectedFile={null} />);

    // Should display all messages
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/Thank you for the help!/)).toBeTruthy();
    expect(screen.getByText(/You're welcome!/)).toBeTruthy();
  });

  it('displays file context and messages together', () => {
    render(<ChatArea
      messages={mockMessages}
      isLoading={false}
      selectedFile="/src/Component.tsx"
    />);

    // Should show both file context and messages
    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
  });

  it('handles loading state with existing messages', () => {
    render(<ChatArea messages={mockMessages} isLoading={true} selectedFile={null} />);

    // Should show both messages and loading indicator
    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
    expect(screen.getByText(/AI is thinking/)).toBeTruthy();
  });

  it('formats timestamps correctly', () => {
    const messagesWithRecentTimestamps = [
      {
        type: 'user' as const,
        content: 'Test message',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={messagesWithRecentTimestamps} isLoading={false} selectedFile={null} />);

    // Should display current time format
    expect(screen.getByText(/Test message/)).toBeTruthy();
  });

  it('handles messages with special characters', () => {
    const specialCharMessages = [
      {
        type: 'user' as const,
        content: 'Message with émojis 🚀 and spëcial châractérs!',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={specialCharMessages} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Message with émojis/)).toBeTruthy();
    expect(screen.getByText(/spëcial châractérs/)).toBeTruthy();
  });

  it('maintains layout integrity with long messages', () => {
    const longMessage = {
      type: 'assistant' as const,
      content: 'A'.repeat(200), // Very long message
      timestamp: new Date(),
    };

    render(<ChatArea messages={[longMessage]} isLoading={false} selectedFile={null} />);

    // Should handle long content without crashing
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('handles rapid message updates', () => {
    const { rerender } = render(<ChatArea messages={[]} isLoading={false} selectedFile={null} />);

    // Rapidly update with new messages
    rerender(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();

    // Update again quickly
    rerender(<ChatArea messages={[mockMessages[0]]} isLoading={false} selectedFile={null} />);

    expect(screen.getByText(/Hello, how do I use this component\?/)).toBeTruthy();
  });

  it('displays correct message types with proper styling', () => {
    render(<ChatArea messages={mockMessages} isLoading={false} selectedFile={null} />);

    // User messages should be distinguishable from assistant messages
    // This tests the visual differentiation logic
    expect(screen.getByText(/You:/)).toBeTruthy();
    expect(screen.getByText(/AI:/)).toBeTruthy();
  });

  it('handles empty message content gracefully', () => {
    const emptyMessage = [
      {
        type: 'user' as const,
        content: '',
        timestamp: new Date(),
      },
    ];

    render(<ChatArea messages={emptyMessage} isLoading={false} selectedFile={null} />);

    // Should handle empty content without crashing
    expect(screen.getByText(/You:/)).toBeTruthy();
  });

  it('integrates properly with selected file context', () => {
    const filePath = '/very/long/path/to/deeply/nested/Component.tsx';

    render(<ChatArea messages={[]} isLoading={false} selectedFile={filePath} />);

    // Should show the file context
    expect(screen.getByText(/📎/)).toBeTruthy();
    expect(screen.getByText(/Component\.tsx/)).toBeTruthy();
  });
});
});
