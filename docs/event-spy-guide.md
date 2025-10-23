
# Event Spy and Input Injection Guide

This guide explains how to spy on events and programmatically provide input to Wren.

## 1. Spying on Keypress Events

### Method A: Hook into useKeypress

```typescript
// In packages/cli/src/ui/hooks/useKeypress.ts
// Add event logging to the handleKeypress function:

const handleKeypress = (_: unknown, key: Key) => {
  // SPY: Log all keypress events
  console.log('[EVENT SPY] Keypress:', {
    name: key.name,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
    paste: key.paste,
    sequence: key.sequence,
    timestamp: Date.now()
  });
  
  // Continue with normal processing...
  if (key.name === 'paste-start') {
    isPaste = true;
  }
  // ... rest of the handler
};
```

### Method B: Create an Event Spy Hook

```typescript
// Create packages/cli/src/ui/hooks/useEventSpy.ts
import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import readline from 'readline';

export interface EventSpyOptions {
  onKeypress?: (key: any) => void;
  onInput?: (text: string) => void;
  enabled?: boolean;
}

export function useEventSpy(options: EventSpyOptions) {
  const { stdin } = useStdin();
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!options.enabled || !stdin.isTTY) {
      return;
    }

    const handleKeypress = (_: unknown, key: any) => {
      optionsRef.current.onKeypress?.(key);
    };

    const handleData = (data: Buffer) => {
      optionsRef.current.onInput?.(data.toString());
    };

    const rl = readline.createInterface({ input: stdin });
    readline.emitKeypressEvents(stdin, rl);
    
    stdin.on('keypress', handleKeypress);
    stdin.on('data', handleData);

    return () => {
      stdin.removeListener('keypress', handleKeypress);
      stdin.removeListener('data', handleData);
      rl.close();
    };
  }, [options.enabled, stdin]);
}
```

## 2. Spying on Gemini Stream Events

### Add Event Logging to processGeminiStreamEvents

```typescript
// In packages/cli/src/ui/hooks/useGeminiStream.ts
// Modify the processGeminiStreamEvents function:

const processGeminiStreamEvents = useCallback(
  async (
    stream: AsyncIterable<GeminiEvent>,
    userMessageTimestamp: number,
    signal: AbortSignal,
  ): Promise<StreamProcessingStatus> => {
    let geminiMessageBuffer = '';
    const toolCallRequests: ToolCallRequestInfo[] = [];
    
    for await (const event of stream) {
      // SPY: Log all Gemini events
      console.log('[EVENT SPY] Gemini Event:', {
        type: event.type,
        timestamp: Date.now(),
        value: event.value
      });
      
      switch (event.type) {
        case ServerGeminiEventType.Thought:
          setThought(event.value);
          break;
        // ... rest of the cases
      }
    }
    // ... rest of the function
  },
  // ... dependencies
);
```

## 3. Programmatically Providing Input

### Method A: Direct submitQuery Call

```typescript
// Access the submitQuery function from useGeminiStream
// In your component or test:

const { submitQuery } = useGeminiStream(/* ... params */);

// Programmatically submit a query
submitQuery("Your automated input here");
```

### Method B: Simulate Keypress Events

```typescript
// Create packages/cli/src/utils/inputInjector.ts
import { Readable } from 'stream';

export class InputInjector {
  private stdin: NodeJS.ReadStream;

  constructor(stdin: NodeJS.ReadStream) {
    this.stdin = stdin;
  }

  /**
   * Inject text input as if the user typed it
   */
  injectText(text: string) {
    // Emit data events to simulate typing
    this.stdin.emit('data', Buffer.from(text));
  }

  /**
   * Inject a keypress event
   */
  injectKeypress(key: {
    name: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    sequence: string;
  }) {
    this.stdin.emit('keypress', key.sequence, key);
  }

  /**
   * Inject a complete command with Enter
   */
  injectCommand(command: string) {
    this.injectText(command);
    this.injectKeypress({
      name: 'return',
      sequence: '\r'
    });
  }
}

// Usage:
const injector = new InputInjector(process.stdin);
injector.injectCommand("create a hello world app");
```

### Method C: Use TextBuffer API

```typescript
// The TextBuffer class in packages/cli/src/ui/components/shared/text-buffer.ts
// provides methods to programmatically set text:

const buffer = useTextBuffer({
  initialText: '',
  viewport: { height: 10, width: inputWidth },
  stdin,
  setRawMode,
  isValidPath,
  shellModeActive,
});

// Set text programmatically
buffer.setText("Your input here");

// Then trigger submission
handleSubmitAndClear(buffer.text);
```

## 4. Complete Event Spy Implementation

### Create a Comprehensive Event Logger

```typescript
// Create packages/cli/src/utils/eventLogger.ts
import * as fs from 'fs';
import * as path from 'path';

export class EventLogger {
  private logFile: string;
  private enabled: boolean;

  constructor(logDir: string = '.wren/logs', enabled: boolean = true) {
    this.enabled = enabled;
