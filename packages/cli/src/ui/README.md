# Simplified TUI - Automated QA Test Suite

This directory contains a comprehensive automated testing suite for the simplified TUI architecture that reduces the original 10k+ lines to ~1k lines while preserving the brilliant provider tree functionality.

## 🧪 Test Coverage

### **Test Categories:**

1. **Unit Tests** - Individual component and hook testing
2. **Integration Tests** - Component interaction testing
3. **Error Handling Tests** - Edge cases and failure scenarios
4. **Performance Tests** - Re-render and state management testing

### **Components Tested:**

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `SimpleApp` | `SimpleApp.test.tsx` | ✅ Rendering, State, Hooks Integration |
| `FileTree` | `FileTree.test.tsx` | ✅ Navigation, Expansion, Selection |
| `ChatArea` | `ChatArea.test.tsx` | ✅ Messages, Loading, File Context |
| `InputBar` | `InputBar.test.tsx` | ✅ Input Handling, Submission |
| `SimpleHeader` | Inline with SimpleApp | ✅ Version Display, Path Info |

### **Hooks Tested:**

| Hook | Test File | Coverage |
|------|-----------|----------|
| `useFileTree` | `useFileTree.test.ts` | ✅ File Loading, Filtering, Sorting |
| `useSimpleChat` | `useSimpleChat.test.ts` | ✅ AI Communication, File Context |
| `useCommands` | `useCommands.test.ts` | ✅ Command Processing, Help System |

## 🚀 Running Tests

### **Quick Start:**
```bash
# Run all tests once
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run with UI (if available)
npm run test:ui
```

### **Test Commands:**
```bash
# Run specific test files
npx vitest run SimpleApp.test.tsx
npx vitest run components/
npx vitest run hooks/

# Run integration tests only
npx vitest run integration.test.tsx

# Run with verbose output
npx vitest run --reporter=verbose

# Run specific test pattern
npx vitest run "FileTree"
```

## 📊 Test Results Summary

### **Metrics:**
- **Total Test Files:** 8
- **Total Tests:** 80+
- **Coverage Target:** >90%
- **Performance:** <30s execution time

### **Test Organization:**

```
src/ui/
├── SimpleApp.test.tsx          # Main app integration
├── integration.test.tsx        # Cross-component tests
├── components/
│   ├── FileTree.test.tsx       # Provider tree navigation
│   ├── ChatArea.test.tsx       # Message display & loading
│   └── InputBar.test.tsx       # Input handling & submission
├── hooks/
│   ├── useFileTree.test.ts     # File system operations
│   ├── useSimpleChat.test.ts   # AI communication
│   └── useCommands.test.ts     # Command processing
├── test-utils.tsx              # Mocks & utilities
├── test-setup.ts               # Global test config
└── vitest.config.ts           # Test runner config
```

## 🔧 Test Utilities

### **Mock Data:**
- **File Tree:** Realistic directory structure with nested files
- **AI Responses:** Configurable mock responses with file context
- **Config Objects:** Fully mocked Config with all methods
- **Error Scenarios:** Various failure modes for robustness testing

### **Test Helpers:**
- **Key Simulation:** Programmatic keyboard input testing
- **State Inspection:** Hook state verification utilities
- **Async Testing:** Promise and timer management
- **Error Testing:** Exception handling verification

## 🎯 Key Testing Scenarios

### **Core Functionality:**
- ✅ Component rendering and layout
- ✅ File tree navigation (arrows, enter, tab)
- ✅ Message sending and receiving
- ✅ Command processing (/help, /auth, etc.)
- ✅ File selection and context passing
- ✅ Loading states and error handling

### **Edge Cases:**
- ✅ Empty file trees and missing files
- ✅ Network failures and API errors
- ✅ Invalid user input and malformed data
- ✅ Rapid state changes and re-renders
- ✅ Memory cleanup and unmounting

### **Performance:**
- ✅ Multiple re-renders without memory leaks
- ✅ Rapid key presses and user interactions
- ✅ Large file trees and long messages
- ✅ Async operation coordination

## 🛠️ Development Workflow

### **Writing New Tests:**
1. **Identify the component/hook to test**
2. **Create test file with proper naming** (`ComponentName.test.tsx`)
3. **Use existing mocks and utilities** from `test-utils.tsx`
4. **Follow the established patterns** for setup/teardown
5. **Test both success and failure scenarios**
6. **Run tests** to ensure they pass

### **Debugging Tests:**
```bash
# Run specific test with debug output
npx vitest run Component.test.tsx --reporter=verbose

# Run in watch mode to see changes
npm run test:watch

# Check coverage for specific files
npm run test:coverage -- --coverage.reporter=html
```

### **Adding New Test Utilities:**
1. **Add to `test-utils.tsx`** for shared use
2. **Document the utility** with clear examples
3. **Ensure proper TypeScript types**
4. **Test the utility** in isolation first

## 📈 Quality Assurance Metrics

### **Coverage Goals:**
- **Statements:** >95%
- **Branches:** >90%
- **Functions:** >95%
- **Lines:** >95%

### **Performance Benchmarks:**
- **Test Execution:** <30 seconds
- **Memory Usage:** <100MB additional
- **CPU Usage:** <50% during tests

### **Reliability Metrics:**
- **Flaky Tests:** <1%
- **False Positives:** <1%
- **Maintenance Burden:** Low (clear, focused tests)

## 🔍 Troubleshooting

### **Common Issues:**

**Test Timeout:**
```bash
# Increase timeout in vitest.config.ts
testTimeout: 15000
```

**Mock Issues:**
```bash
# Ensure mocks are properly reset in beforeEach
vi.clearAllMocks()
```

**Async Problems:**
```bash
# Use proper async/await patterns
await act(async () => {
  // test code
})
```

### **Debug Tips:**
1. **Use `screen.debug()`** to inspect rendered output
2. **Check mock call counts** with `expect(mockFn).toHaveBeenCalledTimes(n)`
3. **Verify hook dependencies** are correctly memoized
4. **Test error boundaries** for proper error handling

## 📝 Contributing

When adding new features to the simplified TUI:

1. **Write tests first** (TDD approach)
2. **Ensure all tests pass** before submitting
3. **Update this README** if adding new test patterns
4. **Maintain test coverage** above 90%
5. **Follow existing naming conventions**

The automated QA suite ensures the simplified architecture maintains reliability while dramatically reducing complexity from the original 10k+ lines to ~1k lines.
This directory contains a comprehensive automated testing suite for the simplified TUI architecture that reduces the original 10k+ lines to ~1k lines while preserving the brilliant provider tree functionality.

## 🧪 Test Coverage

### **Test Categories:**

1. **Unit Tests** - Individual component and hook testing
2. **Integration Tests** - Component interaction testing
3. **Error Handling Tests** - Edge cases and failure scenarios
4. **Performance Tests** - Re-render and state management testing

### **Components Tested:**

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `SimpleApp` | `SimpleApp.test.tsx` | ✅ Rendering, State, Hooks Integration |
| `FileTree` | `FileTree.test.tsx` | ✅ Navigation, Expansion, Selection |
| `ChatArea` | `ChatArea.test.tsx` | ✅ Messages, Loading, File Context |
| `InputBar` | `InputBar.test.tsx` | ✅ Input Handling, Submission |
| `SimpleHeader` | Inline with SimpleApp | ✅ Version Display, Path Info |

### **Hooks Tested:**

| Hook | Test File | Coverage |
|------|-----------|----------|
| `useFileTree` | `useFileTree.test.ts` | ✅ File Loading, Filtering, Sorting |
| `useSimpleChat` | `useSimpleChat.test.ts` | ✅ AI Communication, File Context |
| `useCommands` | `useCommands.test.ts` | ✅ Command Processing, Help System |

## 🚀 Running Tests

### **Quick Start:**
```bash
# Run all tests once
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run with UI (if available)
npm run test:ui
```

### **Test Commands:**
```bash
# Run specific test files
npx vitest run SimpleApp.test.tsx
npx vitest run components/
npx vitest run hooks/

# Run integration tests only
npx vitest run integration.test.tsx

# Run with verbose output
npx vitest run --reporter=verbose

# Run specific test pattern
npx vitest run "FileTree"
```

## 📊 Test Results Summary

### **Metrics:**
- **Total Test Files:** 8
- **Total Tests:** 80+
- **Coverage Target:** >90%
- **Performance:** <30s execution time

### **Test Organization:**

```
src/ui/
├── SimpleApp.test.tsx          # Main app integration
├── integration.test.tsx        # Cross-component tests
├── components/
│   ├── FileTree.test.tsx       # Provider tree navigation
│   ├── ChatArea.test.tsx       # Message display & loading
│   └── InputBar.test.tsx       # Input handling & submission
├── hooks/
│   ├── useFileTree.test.ts     # File system operations
│   ├── useSimpleChat.test.ts   # AI communication
│   └── useCommands.test.ts     # Command processing
├── test-utils.tsx              # Mocks & utilities
├── test-setup.ts               # Global test config
└── vitest.config.ts           # Test runner config
```

## 🔧 Test Utilities

### **Mock Data:**
- **File Tree:** Realistic directory structure with nested files
- **AI Responses:** Configurable mock responses with file context
- **Config Objects:** Fully mocked Config with all methods
- **Error Scenarios:** Various failure modes for robustness testing

### **Test Helpers:**
- **Key Simulation:** Programmatic keyboard input testing
- **State Inspection:** Hook state verification utilities
- **Async Testing:** Promise and timer management
- **Error Testing:** Exception handling verification

## 🎯 Key Testing Scenarios

### **Core Functionality:**
- ✅ Component rendering and layout
- ✅ File tree navigation (arrows, enter, tab)
- ✅ Message sending and receiving
- ✅ Command processing (/help, /auth, etc.)
- ✅ File selection and context passing
- ✅ Loading states and error handling

### **Edge Cases:**
- ✅ Empty file trees and missing files
- ✅ Network failures and API errors
- ✅ Invalid user input and malformed data
- ✅ Rapid state changes and re-renders
- ✅ Memory cleanup and unmounting

### **Performance:**
- ✅ Multiple re-renders without memory leaks
- ✅ Rapid key presses and user interactions
- ✅ Large file trees and long messages
- ✅ Async operation coordination

## 🛠️ Development Workflow

### **Writing New Tests:**
1. **Identify the component/hook to test**
2. **Create test file with proper naming** (`ComponentName.test.tsx`)
3. **Use existing mocks and utilities** from `test-utils.tsx`
4. **Follow the established patterns** for setup/teardown
5. **Test both success and failure scenarios**
6. **Run tests** to ensure they pass

### **Debugging Tests:**
```bash
# Run specific test with debug output
npx vitest run Component.test.tsx --reporter=verbose

# Run in watch mode to see changes
npm run test:watch

# Check coverage for specific files
npm run test:coverage -- --coverage.reporter=html
```

### **Adding New Test Utilities:**
1. **Add to `test-utils.tsx`** for shared use
2. **Document the utility** with clear examples
3. **Ensure proper TypeScript types**
4. **Test the utility** in isolation first

## 📈 Quality Assurance Metrics

### **Coverage Goals:**
- **Statements:** >95%
- **Branches:** >90%
- **Functions:** >95%
- **Lines:** >95%

### **Performance Benchmarks:**
- **Test Execution:** <30 seconds
- **Memory Usage:** <100MB additional
- **CPU Usage:** <50% during tests

### **Reliability Metrics:**
- **Flaky Tests:** <1%
- **False Positives:** <1%
- **Maintenance Burden:** Low (clear, focused tests)

## 🔍 Troubleshooting

### **Common Issues:**

**Test Timeout:**
```bash
# Increase timeout in vitest.config.ts
testTimeout: 15000
```

**Mock Issues:**
```bash
# Ensure mocks are properly reset in beforeEach
vi.clearAllMocks()
```

**Async Problems:**
```bash
# Use proper async/await patterns
await act(async () => {
  // test code
})
```

### **Debug Tips:**
1. **Use `screen.debug()`** to inspect rendered output
2. **Check mock call counts** with `expect(mockFn).toHaveBeenCalledTimes(n)`
3. **Verify hook dependencies** are correctly memoized
4. **Test error boundaries** for proper error handling

## 📝 Contributing

When adding new features to the simplified TUI:

1. **Write tests first** (TDD approach)
2. **Ensure all tests pass** before submitting
3. **Update this README** if adding new test patterns
4. **Maintain test coverage** above 90%
5. **Follow existing naming conventions**

The automated QA suite ensures the simplified architecture maintains reliability while dramatically reducing complexity from the original 10k+ lines to ~1k lines.
The automated QA suite ensures the simplified architecture maintains reliability while dramatically reducing complexity from the original 10k+ lines to ~1k lines.
