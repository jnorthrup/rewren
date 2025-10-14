/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { VerificationTool } from './verification.js';
import { Config } from '../config/config.js';

describe('VerificationTool', () => {
  const mockConfig = {} as Config;
  const tool = new VerificationTool(mockConfig);

  describe('validateToolParams', () => {
    it('should validate correct parameters', () => {
      const result = tool.validateToolParams({
        outputType: 'code',
        content: 'function test() { return true; }',
      });
      expect(result).toBeNull();
    });

    it('should reject missing outputType', () => {
      const result = tool.validateToolParams({
        content: 'some content',
      } as any);
      expect(result).toBe('outputType and content are required');
    });

    it('should reject missing content', () => {
      const result = tool.validateToolParams({
        outputType: 'code',
      } as any);
      expect(result).toBe('outputType and content are required');
    });

    it('should reject invalid outputType', () => {
      const result = tool.validateToolParams({
        outputType: 'invalid',
        content: 'some content',
      } as any);
      expect(result).toBe('outputType must be one of: code, explanation, plan, test, documentation, other');
    });
  });

  describe('execute', () => {
    it('should analyze code output', async () => {
      const result = await tool.execute({
        outputType: 'code',
        content: 'function test() { console.log("debug"); return true; }',
      }, new AbortController().signal);

      expect(result.summary).toContain('Verified code output');
      expect(result.returnDisplay).toContain('AI Output Verification Report');
      expect(result.returnDisplay).toContain('Risk Level');
    });

    it('should analyze test output', async () => {
      const result = await tool.execute({
        outputType: 'test',
        content: 'describe("test", () => { it("should work", () => { expect(true).toBe(true); }); });',
      }, new AbortController().signal);

      expect(result.summary).toContain('Verified test output');
      expect(result.returnDisplay).toContain('Follows testing framework conventions');
    });

    it('should include COT analysis when provided', async () => {
      const cotLogs = '[COT-REASONING] {"content": "Let me analyze this code"} [COT-FINAL] {"content": "The code looks good"}';
      const result = await tool.execute({
        outputType: 'code',
        content: 'function hello() { return "world"; }',
        cotLogs,
      }, new AbortController().signal);

      expect(result.returnDisplay).toContain('AI Output Verification Report');
    });

    it('should generate verification checkpoints for code', async () => {
      const result = await tool.execute({
        outputType: 'code',
        content: 'function add(a, b) { return a + b; }',
        context: 'Adding a new utility function',
      }, new AbortController().signal);

      expect(result.returnDisplay).toContain('Verification Checkpoints');
      expect(result.returnDisplay).toContain('Code compiles without errors');
      expect(result.returnDisplay).toContain('Unit tests pass');
    });

    it('should include DORA research insights', async () => {
      const result = await tool.execute({
        outputType: 'code',
        content: 'const x = 1;',
      }, new AbortController().signal);

      expect(result.returnDisplay).toContain('DORA Research Insights');
      expect(result.returnDisplay).toContain('**95%** of developers use AI assistance');
      expect(result.returnDisplay).toContain('**Small steps** with **continuous verification**');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should not require confirmation', async () => {
      const result = await tool.shouldConfirmExecute({
        outputType: 'code',
        content: 'test',
      }, new AbortController().signal);

      expect(result).toBe(false);
    });
  });
});