#!/usr/bin/env node

// ESM harness to exercise ProviderConfigService CRUD and performance metrics
import { ProviderConfigService } from '../packages/core/dist/src/services/providerConfigService.js';
import { Providers } from '../packages/core/dist/src/config/providers.js';
import path from 'node:path';

async function run() {
  console.log('=== ProviderConfigService CRUD harness ===');

  const baseURL = 'https://api.example-provider.test/v1';
  const apiKey = 'test-api-key-123';

  console.log('\n1) Create provider (OPENAI)');
  const created = ProviderConfigService.createProvider(Providers.OPENAI, baseURL, apiKey);
  console.log(' created:', created);

  console.log('\n2) List providers');
  const all = ProviderConfigService.getAllProviders();
  console.log(JSON.stringify(all, null, 2));

  console.log('\n3) Update provider apiKey and baseURL');
  const updated = ProviderConfigService.updateProvider(Providers.OPENAI, { apiKey: 'updated-key-456', baseURL });
  console.log(' updated:', updated);

  console.log('\n4) Get provider and performance stats');
  const prov = ProviderConfigService.getProvider(Providers.OPENAI);
  console.log(JSON.stringify(prov, null, 2));
  console.log('performance:', ProviderConfigService.getPerformanceStats(Providers.OPENAI));

  console.log('\n5) Simulate updates to performance stats (success/failure)');
  ProviderConfigService.updatePerformanceStats(Providers.OPENAI, true, 120, 50);
  ProviderConfigService.updatePerformanceStats(Providers.OPENAI, false, 500, undefined);
  console.log('performance after updates:', ProviderConfigService.getPerformanceStats(Providers.OPENAI));

  console.log('\n6) Export config to .wren/providers-export.json');
  const exportPath = path.join('.wren', 'providers-export.json');
  const exported = ProviderConfigService.exportConfig(exportPath);
  console.log(' exported:', exported);

  console.log('\n7) Disable provider');
  ProviderConfigService.disableProvider(Providers.OPENAI);
  console.log(' providers after disable:', ProviderConfigService.getAllProviders().map(p => ({ provider: p.provider, enabled: p.enabled })));

  console.log('\n8) Re-enable provider');
  ProviderConfigService.enableProvider(Providers.OPENAI);
  console.log(' providers after enable:', ProviderConfigService.getAllProviders().map(p => ({ provider: p.provider, enabled: p.enabled })));

  console.log('\n9) Delete provider');
  const deleted = ProviderConfigService.deleteProvider(Providers.OPENAI);
  console.log(' deleted:', deleted);

  console.log('\n10) Try import back');
  const imported = ProviderConfigService.importConfig(exportPath);
  console.log(' imported:', imported);

  console.log('\n11) Final providers:');
  console.log(JSON.stringify(ProviderConfigService.getAllProviders(), null, 2));

  console.log('\nDone');
}

run().catch((err) => {
  console.error('Error running auth CRUD harness:', err);
  process.exit(1);
});
