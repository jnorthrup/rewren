/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * TestContextExtractor - Parse test files to extract acceptance criteria
 *
 * Use Case: When AI modifies code, inject relevant test assertions into prompt
 * DORA Alignment: "Tests verify AI changes didn't break functionality"
 *
 * Example:
 *   User: "fix the auth middleware"
 *   AI reads: auth.test.ts
 *   Prompt includes: "Success = these tests pass: [test assertions]"
 *   AI makes changes knowing the target state
 */

export interface TestAssertion {
  testName: string;
  filePath: string;
  assertion: string;
  lineNumber: number;
}

export interface TestContext {
  relatedTests: TestAssertion[];
  testCommands: string[];
  coverageTarget?: number;
}

export class TestContextExtractor {
  constructor(private workspaceRoot: string) {}

  /**
   * Extract test context for a given source file
   * Finds related test files and parses assertions
   */
  async extractTestContext(sourceFile: string): Promise<TestContext> {
    const testFiles = await this.findRelatedTestFiles(sourceFile);
    const relatedTests: TestAssertion[] = [];

    for (const testFile of testFiles) {
      const assertions = await this.parseTestFile(testFile);
      relatedTests.push(...assertions);
    }

    const testCommands = await this.extractTestCommands();

    return {
      relatedTests,
      testCommands,
    };
  }

  /**
   * Find test files related to a source file
   * Conventions:
   *   - foo.ts → foo.test.ts, foo.spec.ts
   *   - src/foo.ts → tests/foo.test.ts, __tests__/foo.test.ts
   */
  private async findRelatedTestFiles(sourceFile: string): Promise<string[]> {
    const candidates: string[] = [];
    const basename = path.basename(sourceFile, path.extname(sourceFile));
    const dirname = path.dirname(sourceFile);

    // Same directory: foo.test.ts, foo.spec.ts
    candidates.push(
      path.join(dirname, `${basename}.test.ts`),
      path.join(dirname, `${basename}.test.js`),
      path.join(dirname, `${basename}.spec.ts`),
      path.join(dirname, `${basename}.spec.js`)
    );

    // __tests__ sibling: __tests__/foo.test.ts
    candidates.push(
      path.join(dirname, '__tests__', `${basename}.test.ts`),
      path.join(dirname, '__tests__', `${basename}.test.js`)
    );

    // tests/ parallel: src/foo.ts → tests/foo.test.ts
    const srcRelative = path.relative(this.workspaceRoot, sourceFile);
    if (srcRelative.startsWith('src/')) {
      const testPath = srcRelative.replace(/^src\//, 'tests/');
      const testBasename = path.basename(testPath, path.extname(testPath));
      candidates.push(
        path.join(this.workspaceRoot, path.dirname(testPath), `${testBasename}.test.ts`),
        path.join(this.workspaceRoot, path.dirname(testPath), `${testBasename}.test.js`)
      );
    }

    // Filter to files that actually exist
    const existing: string[] = [];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        existing.push(candidate);
      } catch {
        // File doesn't exist, skip
      }
    }

    return existing;
  }

  /**
   * Parse test file to extract assertions
   * Supports: describe/it/test (Jest/Vitest)
   */
  private async parseTestFile(testFile: string): Promise<TestAssertion[]> {
    const content = await fs.readFile(testFile, 'utf-8');
    const lines = content.split('\n');
    const assertions: TestAssertion[] = [];

    let currentTestName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect test blocks: it('should...', test('should...', test.skip(...
      const testMatch = line.match(/(?:it|test)(?:\.skip|\.only)?\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (testMatch) {
        currentTestName = testMatch[1];
      }

      // Detect assertions: expect(...).toBe(...), expect(...).toEqual(...)
      const assertMatch = line.match(/expect\(([^)]+)\)\s*\.\s*(\w+)\s*\(([^)]*)\)/);
      if (assertMatch && currentTestName) {
        assertions.push({
          testName: currentTestName,
          filePath: testFile,
          assertion: line.trim(),
          lineNumber: i + 1,
        });
      }

      // Detect assertion shorthands: assert.equal(...), assert(...)
      const assertShortMatch = line.match(/assert(?:\.(\w+))?\s*\(/);
      if (assertShortMatch && currentTestName) {
        assertions.push({
          testName: currentTestName,
          filePath: testFile,
          assertion: line.trim(),
          lineNumber: i + 1,
        });
      }
    }

    return assertions;
  }

  /**
   * Extract test commands from package.json
   */
  private async extractTestCommands(): Promise<string[]> {
    const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const scripts = packageJson.scripts || {};

      const testCommands: string[] = [];
      for (const [key, value] of Object.entries(scripts)) {
        if (key.startsWith('test') || key.includes('test')) {
          testCommands.push(`npm run ${key}  # ${value}`);
        }
      }

      return testCommands;
    } catch {
      return ['npm test  # (no package.json found)'];
    }
  }

  /**
   * Format test context for inclusion in AI prompt
   * Returns concise summary suitable for system prompt injection
   */
  formatForPrompt(context: TestContext, sourceFile: string): string {
    if (context.relatedTests.length === 0) {
      return `# ${path.basename(sourceFile)}\nNo related tests found. After changes, add tests.`;
    }

    const lines: string[] = [];
    lines.push(`# ${path.basename(sourceFile)} - Test Requirements`);
    lines.push('');
    lines.push('**Acceptance Criteria** (these tests must pass):');
    lines.push('');

    // Group by test file
    const byFile = new Map<string, TestAssertion[]>();
    for (const assertion of context.relatedTests) {
      const existing = byFile.get(assertion.filePath) || [];
      existing.push(assertion);
      byFile.set(assertion.filePath, existing);
    }

    for (const [file, assertions] of byFile) {
      lines.push(`**${path.basename(file)}**:`);

      // Group by test name
      const byTest = new Map<string, TestAssertion[]>();
      for (const assertion of assertions) {
        const existing = byTest.get(assertion.testName) || [];
        existing.push(assertion);
        byTest.set(assertion.testName, existing);
      }

      for (const [testName, testAssertions] of byTest) {
        lines.push(`- "${testName}"`);
        for (const assertion of testAssertions.slice(0, 3)) { // Limit to 3 assertions per test
          lines.push(`  - ${assertion.assertion}`);
        }
        if (testAssertions.length > 3) {
          lines.push(`  - ... (${testAssertions.length - 3} more assertions)`);
        }
      }
      lines.push('');
    }

    if (context.testCommands.length > 0) {
      lines.push('**Verify with**:');
      for (const cmd of context.testCommands.slice(0, 3)) {
        lines.push(`- \`${cmd}\``);
      }
      lines.push('');
    }

    lines.push('**Important**: All listed tests MUST pass after your changes.');

    return lines.join('\n');
  }

  /**
   * Quick check: does file have related tests?
   */
  async hasTests(sourceFile: string): Promise<boolean> {
    const testFiles = await this.findRelatedTestFiles(sourceFile);
    return testFiles.length > 0;
  }
}

/**
 * Helper: Inject test context into user prompt when modifying files
 */
export async function enrichPromptWithTests(
  userPrompt: string,
  affectedFiles: string[],
  workspaceRoot: string
): Promise<string> {
  const extractor = new TestContextExtractor(workspaceRoot);
  const testContexts: string[] = [];

  for (const file of affectedFiles.slice(0, 5)) { // Limit to 5 files to avoid prompt bloat
    if (await extractor.hasTests(file)) {
      const context = await extractor.extractTestContext(file);
      const formatted = extractor.formatForPrompt(context, file);
      testContexts.push(formatted);
    }
  }

  if (testContexts.length === 0) {
    return userPrompt;
  }

  return `${userPrompt}

---

${testContexts.join('\n\n---\n\n')}`;
}
