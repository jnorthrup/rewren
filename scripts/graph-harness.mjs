#!/usr/bin/env node

// Quick ESM harness to exercise GraphService using built dist
import { GraphService } from '../packages/core/dist/src/services/graphService.js';
import { Config } from '../packages/core/dist/src/config/config.js';

// Minimal mock Config implementing getWorkingDir
class MockConfig {
  getWorkingDir() {
    return process.cwd();
  }
}

(async function main(){
  const cfg = new MockConfig();
  const svc = new GraphService(cfg);

  console.log('Loading graph...');
  let g = await svc.getGraph();
  console.log('Initial nodes:', g.nodes.length, 'edges:', g.edges.length);

  // Add provider node
  try {
    await svc.addNode({ id: 'provider_openai', type: 'provider', label: 'OpenAI', metadata: { url: 'https://api.openai.com' } });
    console.log('Added provider_openai');
  } catch (e) { console.log('Add provider error:', e.message || e); }

  // Add model node
  try {
    await svc.addNode({ id: 'model_gpt4', type: 'model', label: 'gpt-4', metadata: { tokens: 32768 } });
    console.log('Added model_gpt4');
  } catch (e) { console.log('Add model error:', e.message || e); }

  // Add config node
  try {
    await svc.addNode({ id: 'config_default', type: 'config', label: 'default', metadata: { temperature: 0.2 } });
    console.log('Added config_default');
  } catch (e) { console.log('Add config error:', e.message || e); }

  // Add metric node
  try {
    await svc.addNode({ id: 'metric_credits', type: 'metric', label: 'credits', metadata: { unit: 'USD' } });
    console.log('Added metric_credits');
  } catch (e) { console.log('Add metric error:', e.message || e); }

  // Add edges
  try {
    await svc.addEdge({ id: 'e1', from: 'provider_openai', to: 'model_gpt4', label: 'provides' });
    console.log('Added edge e1');
  } catch (e) { console.log('Add edge e1 error:', e.message || e); }
  try {
    await svc.addEdge({ id: 'e2', from: 'model_gpt4', to: 'config_default', label: 'uses' });
    console.log('Added edge e2');
  } catch (e) { console.log('Add edge e2 error:', e.message || e); }
  try {
    await svc.addEdge({ id: 'e3', from: 'provider_openai', to: 'metric_credits', label: 'billable' });
    console.log('Added edge e3');
  } catch (e) { console.log('Add edge e3 error:', e.message || e); }

  // List nodes
  g = await svc.getGraph();
  console.log('\nGraph now:');
  console.log(JSON.stringify(g, null, 2));

  // Update node
  console.log('\nUpdating node model_gpt4 metadata...');
  await svc.updateNode('model_gpt4', { metadata: { tokens: 65536 } });
  console.log('Updated.');

  // Delete an edge
  console.log('\nDeleting edge e2...');
  await svc.deleteEdge('e2');
  console.log('Deleted e2');

  // Delete a node
  console.log('\nDeleting node metric_credits...');
  await svc.deleteNode('metric_credits');
  console.log('Deleted metric_credits');

  // Final graph
  g = await svc.getGraph();
  console.log('\nFinal Graph:');
  console.log(JSON.stringify(g, null, 2));

  console.log('\nHarness complete.');
})();
