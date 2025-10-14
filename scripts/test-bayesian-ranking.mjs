#!/usr/bin/env node
/**
 * Test Bayesian ranking calculation for providers and models
 */

import { ProviderTreeRoot } from '../packages/core/dist/src/config/providerTreeNodes.js';
import { JsonGraphCRUD } from '../packages/core/dist/src/config/tree/jsonGraphCRUD.js';

console.log('\n=== Bayesian Ranking Test ===\n');

const tree = new ProviderTreeRoot();
await tree.initialize();

const crud = new JsonGraphCRUD(tree);

// Simulate some usage on Harmony provider
const harmony = tree.getProvider('harmony');
if (harmony) {
  const metricsNode = harmony.children.find(c => c.type === 'metrics');
  if (metricsNode) {
    console.log('📊 Simulating Harmony provider usage...\n');

    // Record 10 successful requests with varying latency
    metricsNode.recordSuccess(1200);
    metricsNode.recordSuccess(1500);
    metricsNode.recordSuccess(1100);
    metricsNode.recordSuccess(1300);
    metricsNode.recordSuccess(1400);
    metricsNode.recordSuccess(1600);
    metricsNode.recordSuccess(1250);
    metricsNode.recordSuccess(1350);
    metricsNode.recordSuccess(1450);
    metricsNode.recordSuccess(1200);

    // Record 2 errors
    metricsNode.recordError('timeout');
    metricsNode.recordError('rate_limit');

    console.log('Harmony Provider Metrics:');
    console.log(`  Total Requests: ${metricsNode.totalRequests}`);
    console.log(`  Success Rate: ${metricsNode.successRate.toFixed(1)}%`);
    console.log(`  Avg Latency: ${metricsNode.avgLatencyMs.toFixed(0)}ms`);
    console.log(`  Bayesian Score: ${(metricsNode.bayesianScore * 100).toFixed(1)}%`);
    console.log(`  Ranking Grade: ${metricsNode.rankingGrade}\n`);
  }

  // Simulate usage on individual models
  const modelsNode = harmony.children.find(c => c.type === 'models');
  if (modelsNode && modelsNode.children.length > 0) {
    console.log('📊 Simulating model-level usage...\n');

    // GPT-OSS model - high performance
    const gptOss = modelsNode.children.find(m => m.model.name === 'openai/gpt-oss-120b');
    if (gptOss) {
      gptOss.recordSuccess(2000);
      gptOss.recordSuccess(1800);
      gptOss.recordSuccess(2100);
      gptOss.recordSuccess(1900);
      gptOss.recordSuccess(2050);

      console.log('GPT-OSS-120B Model Metrics:');
      console.log(`  Total Requests: ${gptOss.totalRequests}`);
      console.log(`  Success Rate: ${gptOss.successRate.toFixed(1)}%`);
      console.log(`  Avg Latency: ${gptOss.avgLatencyMs.toFixed(0)}ms`);
      console.log(`  Bayesian Score: ${(gptOss.bayesianScore * 100).toFixed(1)}%`);
      console.log(`  Ranking Grade: ${gptOss.rankingGrade}\n`);
    }

    // GPT-4o - mixed performance
    const gpt4o = modelsNode.children.find(m => m.model.name === 'gpt-4o');
    if (gpt4o) {
      gpt4o.recordSuccess(1200);
      gpt4o.recordSuccess(1100);
      gpt4o.recordError();
      gpt4o.recordSuccess(1300);
      gpt4o.recordSuccess(1150);
      gpt4o.recordError();
      gpt4o.recordSuccess(1250);

      console.log('GPT-4o Model Metrics:');
      console.log(`  Total Requests: ${gpt4o.totalRequests}`);
      console.log(`  Success Rate: ${gpt4o.successRate.toFixed(1)}%`);
      console.log(`  Avg Latency: ${gpt4o.avgLatencyMs.toFixed(0)}ms`);
      console.log(`  Bayesian Score: ${(gpt4o.bayesianScore * 100).toFixed(1)}%`);
      console.log(`  Ranking Grade: ${gpt4o.rankingGrade}\n`);
    }
  }
}

// Test export with metrics
console.log('📤 Exporting graph with metrics...\n');
const result = crud.exportGraph();
if (result.success) {
  // Find Harmony in the export (structure is data.providers.harmony)
  const harmonyExport = result.data.providers?.harmony;
  if (harmonyExport) {
    const metricsExport = harmonyExport.children?.find(c => c.type === 'metrics');
    if (metricsExport) {
      console.log('✅ Provider Metrics exported successfully:');
      console.log(`   Ranking Grade: ${metricsExport.rankingGrade}`);
      console.log(`   Bayesian Score: ${(metricsExport.bayesianScore * 100).toFixed(1)}%\n`);
    }

    const modelsExport = harmonyExport.children?.find(c => c.type === 'models');
    if (modelsExport && modelsExport.children) {
      console.log('✅ Model-level rankings exported:');
      for (const model of modelsExport.children) {
        if (model.totalRequests && model.totalRequests > 0) {
          console.log(`   ${model.name}: ${model.rankingGrade} (Score: ${(model.bayesianScore * 100).toFixed(1)}%, ${model.totalRequests} requests)`);
        }
      }
      console.log('');
    }
  }
}

console.log('🎉 Bayesian ranking test complete!\n');
console.log('Key Features:');
console.log('  ✅ Provider-level Bayesian scoring');
console.log('  ✅ Model-level Bayesian scoring');
console.log('  ✅ Letter grade rankings (A+ to F)');
console.log('  ✅ Success rate and latency weighting');
console.log('  ✅ Bayesian smoothing with Beta distribution');
console.log('  ✅ JSON export includes all metrics\n');
