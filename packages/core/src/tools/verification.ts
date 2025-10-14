/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolCallConfirmationDetails, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';

// Verification checkpoint schema
export interface VerificationCheckpoint {
  checkpointId: string;
  actionType: 'code_change' | 'file_creation' | 'file_deletion' | 'shell_command';
  description: string;
  confidence: number; // 0-1
  reasoning: string;
  verificationCriteria: string[];
  rollbackCommand?: string;
}

export interface VerificationAnalysis {
  overallConfidence: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  checkpoints: VerificationCheckpoint[];
}

export interface VerificationToolParams {
  outputType: 'code' | 'explanation' | 'plan' | 'test' | 'documentation' | 'other';
  content: string;
  context?: string;
  cotLogs?: string;
}

/**
 * AI Output Verification Tool
 * Analyzes AI-generated output using Chain of Thought logs and provides verification checkpoints
 * based on DORA research findings about AI adoption in software development.
 */
export class VerificationTool extends BaseTool<VerificationToolParams, ToolResult> {
  constructor(private readonly config: Config) {
    super(
      'verify_ai_output',
      'AI Output Verification',
      'Analyzes AI-generated output using Chain of Thought logs and provides verification checkpoints based on DORA research findings',
      {
        type: Type.OBJECT,
        properties: {
          outputType: {
            type: Type.STRING,
            description: 'Type of AI output to verify',
            enum: ['code', 'explanation', 'plan', 'test', 'documentation', 'other'],
          },
          content: {
            type: Type.STRING,
            description: 'The AI-generated content to analyze',
          },
          context: {
            type: Type.STRING,
            description: 'Context about what the AI was asked to do',
          },
          cotLogs: {
            type: Type.STRING,
            description: 'Chain of Thought logs from the AI reasoning process (if available)',
          },
        },
        required: ['outputType', 'content'],
      },
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }

  validateToolParams(params: VerificationToolParams): string | null {
    if (!params.outputType || !params.content) {
      return 'outputType and content are required';
    }
    if (!['code', 'explanation', 'plan', 'test', 'documentation', 'other'].includes(params.outputType)) {
      return 'outputType must be one of: code, explanation, plan, test, documentation, other';
    }
    return null;
  }

  getDescription(params: VerificationToolParams): string {
    return `Verify AI-generated ${params.outputType} output using DORA research-based analysis`;
  }

  async shouldConfirmExecute(
    _params: VerificationToolParams,
    _abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    return false; // This is a read-only analysis tool
  }

  async execute(
    params: VerificationToolParams,
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void
  ): Promise<ToolResult> {
    const analysis = await this.analyzeAIOutput(params);
    const report = this.formatVerificationReport(analysis, params);

    return {
      summary: `Verified ${params.outputType} output with ${Math.round(analysis.overallConfidence * 100)}% confidence`,
      llmContent: [{ text: report }],
      returnDisplay: report,
    };
  }

  private async analyzeAIOutput(params: VerificationToolParams): Promise<VerificationAnalysis> {
    const { outputType, content, context, cotLogs } = params;

    // Analyze COT logs if available
    let cotConfidence = 0.5; // Default neutral confidence
    let reasoningQuality = 'unknown';

    if (cotLogs) {
      const cotAnalysis = this.analyzeCOTLogs(cotLogs);
      cotConfidence = cotAnalysis.confidence;
      reasoningQuality = cotAnalysis.quality;
    }

    // Content analysis based on type
    const contentAnalysis = this.analyzeContent(content, outputType);

    // Calculate overall confidence
    const overallConfidence = (cotConfidence * 0.6) + (contentAnalysis.confidence * 0.4);

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(overallConfidence, outputType, contentAnalysis);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      overallConfidence,
      riskLevel,
      outputType,
      contentAnalysis,
      reasoningQuality
    );

    // Create verification checkpoints
    const checkpoints = this.createVerificationCheckpoints(
      outputType,
      content,
      context,
      overallConfidence
    );

    return {
      overallConfidence,
      riskLevel,
      recommendations,
      checkpoints,
    };
  }

  private analyzeCOTLogs(cotLogs: string): { confidence: number; quality: string } {
    // Parse COT log entries
    const reasoningEntries = cotLogs.match(/\[COT-REASONING\].*?"content":"([^"]*)"/g) || [];
    const finalEntries = cotLogs.match(/\[COT-FINAL\].*?"content":"([^"]*)"/g) || [];

    const totalReasoningLength = reasoningEntries.join('').length;
    const totalFinalLength = finalEntries.join('').length;

    // Higher reasoning-to-output ratio suggests better thinking
    const reasoningRatio = totalFinalLength > 0 ? totalReasoningLength / totalFinalLength : 0;

    let confidence: number;
    let quality: string;

    if (reasoningRatio > 2) {
      confidence = 0.8;
      quality = 'thorough';
    } else if (reasoningRatio > 1) {
      confidence = 0.6;
      quality = 'adequate';
    } else if (reasoningRatio > 0.5) {
      confidence = 0.4;
      quality = 'minimal';
    } else {
      confidence = 0.2;
      quality = 'insufficient';
    }

    return { confidence, quality };
  }

  private analyzeContent(content: string, outputType: string): {
    confidence: number;
    issues: string[];
    patterns: string[];
  } {
    const issues: string[] = [];
    const patterns: string[] = [];
    let confidence = 0.5;

    switch (outputType) {
      case 'code': {
        // Check for code quality indicators
        if (content.includes('TODO') || content.includes('FIXME')) {
          issues.push('Contains TODO/FIXME comments');
          confidence -= 0.1;
        }

        if (content.includes('console.log') && !content.includes('// DEBUG')) {
          issues.push('Contains debug logging in production code');
          confidence -= 0.1;
        }

        const declarations = content.match(/\b(function|class|const|let|var)\b/g)?.length || 0;
        if (declarations > 5) {
          patterns.push('Contains multiple declarations - check for proper structure');
        }

        // Look for error handling
        if (content.includes('try') || content.includes('catch')) {
          patterns.push('Includes error handling');
          confidence += 0.1;
        }

        break;
      }

      case 'test':
        if (content.includes('describe') || content.includes('it(') || content.includes('test(')) {
          patterns.push('Follows testing framework conventions');
          confidence += 0.1;
        }

        if (content.includes('expect') || content.includes('assert')) {
          patterns.push('Contains assertions');
          confidence += 0.1;
        }

        break;

      case 'explanation':
        if (content.length > 100) {
          patterns.push('Provides detailed explanation');
          confidence += 0.1;
        }

        if (content.includes('because') || content.includes('therefore')) {
          patterns.push('Shows logical reasoning');
          confidence += 0.1;
        }

        break;

      default:
        // No specific analysis for other types
        break;
    }

    // General content checks
    if (content.length < 10) {
      issues.push('Content is very short');
      confidence -= 0.2;
    }

    if (content.includes('I think') || content.includes('probably') || content.includes('maybe')) {
      issues.push('Contains uncertain language');
      confidence -= 0.1;
    }

    return { confidence: Math.max(0, Math.min(1, confidence)), issues, patterns };
  }

  private calculateRiskLevel(
    confidence: number,
    outputType: string,
    contentAnalysis: { issues: string[] }
  ): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = (1 - confidence) * 100;

    // Adjust based on output type
    const typeMultipliers: Record<string, number> = {
      code: 1.5, // Code changes are highest risk
      test: 1.2,
      plan: 1.0,
      explanation: 0.7,
      documentation: 0.5,
      other: 1.0,
    };

    riskScore *= typeMultipliers[outputType] || 1.0;

    // Adjust based on issues
    riskScore += contentAnalysis.issues.length * 10;

    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    confidence: number,
    riskLevel: string,
    outputType: string,
    contentAnalysis: { issues: string[]; patterns: string[] },
    reasoningQuality: string
  ): string[] {
    const recommendations: string[] = [];

    if (confidence < 0.5) {
      recommendations.push('🔴 Low confidence - Manual review strongly recommended');
    }

    if (riskLevel === 'high' || riskLevel === 'critical') {
      recommendations.push('🚨 High risk - Consider breaking into smaller changes');
    }

    if (reasoningQuality === 'insufficient') {
      recommendations.push('🤔 Limited reasoning visible - Request more detailed explanation');
    }

    contentAnalysis.issues.forEach(issue => {
      recommendations.push(`⚠️ ${issue}`);
    });

    contentAnalysis.patterns.forEach(pattern => {
      recommendations.push(`✅ ${pattern}`);
    });

    if (outputType === 'code') {
      recommendations.push('💻 Code change - Run tests and verify functionality');
      recommendations.push('🔄 Consider creating a git branch for this change');
    }

    recommendations.push('📊 Based on DORA research: Verify in small steps, not all at once');

    return recommendations;
  }

  private createVerificationCheckpoints(
    outputType: string,
    content: string,
    context?: string,
    confidence?: number
  ): VerificationCheckpoint[] {
    const checkpoints: VerificationCheckpoint[] = [];

    const checkpointId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    switch (outputType) {
      case 'code':
        checkpoints.push({
          checkpointId,
          actionType: 'code_change',
          description: context || 'AI-generated code changes',
          confidence: confidence || 0.5,
          reasoning: 'Code changes carry execution risk and should be verified',
          verificationCriteria: [
            'Code compiles without errors',
            'Unit tests pass (if applicable)',
            'Integration tests pass (if applicable)',
            'Manual testing confirms expected behavior',
            'Code review completed',
          ],
          rollbackCommand: 'git checkout HEAD~1 -- .',
        });
        break;

      case 'test':
        checkpoints.push({
          checkpointId,
          actionType: 'file_creation',
          description: context || 'AI-generated test files',
          confidence: confidence || 0.6,
          reasoning: 'Tests ensure system reliability',
          verificationCriteria: [
            'Tests execute without errors',
            'Tests provide meaningful coverage',
            'Tests fail when expected behavior breaks',
            'Test naming follows conventions',
          ],
        });
        break;

      default:
        checkpoints.push({
          checkpointId,
          actionType: 'file_creation',
          description: context || 'AI-generated content',
          confidence: confidence || 0.5,
          reasoning: 'General verification checkpoint',
          verificationCriteria: [
            'Content meets requirements',
            'Content is accurate and complete',
            'Content follows project conventions',
          ],
        });
    }

    return checkpoints;
  }

  private formatVerificationReport(
    analysis: VerificationAnalysis,
    params: VerificationToolParams
  ): string {
    const confidencePercent = Math.round(analysis.overallConfidence * 100);
    const riskEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    }[analysis.riskLevel];

    let report = `# AI Output Verification Report\n\n`;
    report += `## Summary\n\n`;
    report += `- **Output Type:** ${params.outputType}\n`;
    report += `- **Confidence Score:** ${confidencePercent}%\n`;
    report += `- **Risk Level:** ${riskEmoji} ${analysis.riskLevel.toUpperCase()}\n`;
    report += `- **Checkpoints:** ${analysis.checkpoints.length}\n\n`;

    if (analysis.recommendations.length > 0) {
      report += `## Recommendations\n\n`;
      analysis.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
      report += '\n';
    }

    if (analysis.checkpoints.length > 0) {
      report += `## Verification Checkpoints\n\n`;
      analysis.checkpoints.forEach((checkpoint, index) => {
        report += `### Checkpoint ${index + 1}: ${checkpoint.description}\n\n`;
        report += `- **ID:** \`${checkpoint.checkpointId}\`\n`;
        report += `- **Action Type:** ${checkpoint.actionType}\n`;
        report += `- **Confidence:** ${Math.round(checkpoint.confidence * 100)}%\n`;
        report += `- **Reasoning:** ${checkpoint.reasoning}\n\n`;

        if (checkpoint.verificationCriteria.length > 0) {
          report += `**Verification Criteria:**\n`;
          checkpoint.verificationCriteria.forEach(criterion => {
            report += `- [ ] ${criterion}\n`;
          });
          report += '\n';
        }

        if (checkpoint.rollbackCommand) {
          report += `**Rollback Command:** \`${checkpoint.rollbackCommand}\`\n\n`;
        }
      });
    }

    report += `## DORA Research Insights\n\n`;
    report += `Based on the 2024 DORA report on AI adoption:\n\n`;
    report += `- **95%** of developers use AI assistance\n`;
    report += `- **80%** report productivity improvements\n`;
    report += `- **70%** trust AI outputs (concerning given reliability issues)\n`;
    report += `- **Small steps** with **continuous verification** are recommended\n`;
    report += `- **Version control** and **rollback mechanisms** are essential\n\n`;

    report += `Remember: AI is a powerful tool, but human verification ensures reliability.`;

    return report;
  }
}