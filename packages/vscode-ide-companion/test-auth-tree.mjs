#!/usr/bin/env node
/**
 * Test script for the Auth Tree GUI
 * Tests the HTTP endpoints and basic functionality
 */

import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testAuthTreeGUI() {
  console.log('🧪 Testing Auth Tree GUI...\n');

  // Mock the core services for testing
  const mockCore = {
    ProviderConfigService: {
      getAllProviders: () => [
        {
          provider: 'OPENAI',
          baseURL: 'https://api.openai.com',
          apiKey: 'sk-test123',
          enabled: true,
          bayesWeight: 1.0,
          performance: {
            successCount: 95,
            failureCount: 5,
            totalRequests: 100,
            avgLatencyMs: 1200,
            lastUsed: new Date(),
            lastSuccess: new Date(),
            lastFailure: new Date(Date.now() - 86400000),
            avgTokenPerSecond: 25.5,
            errorRate: 5.0
          },
          createdAt: new Date(Date.now() - 86400000 * 7),
          updatedAt: new Date()
        },
        {
          provider: 'ANTHROPIC',
          baseURL: 'https://api.anthropic.com',
          apiKey: null,
          enabled: false,
          bayesWeight: 0.8,
          performance: null,
          createdAt: new Date(Date.now() - 86400000 * 3),
          updatedAt: new Date(Date.now() - 86400000 * 1)
        }
      ],
      createProvider: () => true,
      updateProvider: () => true,
      deleteProvider: () => true
    },
    Providers: {
      OPENAI: 'OPENAI',
      ANTHROPIC: 'ANTHROPIC',
      GOOGLE: 'GOOGLE'
    }
  };

  // Create test server
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Auth tree GUI route
  app.get('/auth-tree', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auth-tree.html'));
  });

  // Mock CRUD endpoints
  app.get('/auth/providers', async (_req, res) => {
    try {
      const providers = mockCore.ProviderConfigService.getAllProviders();
      res.json({ ok: true, providers });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/auth/providers', async (req, res) => {
    const { provider, baseURL, apiKey } = req.body;
    if (!provider || !baseURL) {
      return res.status(400).json({ ok: false, error: 'provider and baseURL required' });
    }

    try {
      const created = mockCore.ProviderConfigService.createProvider(provider, baseURL, apiKey);
      res.json({ ok: created });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.put('/auth/providers/:provider', async (req, res) => {
    const providerParam = req.params.provider;
    const updates = req.body;

    try {
      const updated = mockCore.ProviderConfigService.updateProvider(providerParam, updates);
      res.json({ ok: updated });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.delete('/auth/providers/:provider', async (req, res) => {
    const providerParam = req.params.provider;

    try {
      const deleted = mockCore.ProviderConfigService.deleteProvider(providerParam);
      res.json({ ok: deleted });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Start server on a test port
  const testPort = 3999;
  const server = app.listen(testPort, () => {
    console.log(`🚀 Test server running on http://localhost:${testPort}`);
    console.log(`📱 Auth Tree GUI: http://localhost:${testPort}/auth-tree`);
  });

  // Run basic tests
  console.log('\n🧪 Running endpoint tests...\n');

  // Test 1: GET /auth/providers
  try {
    const response = await fetch(`http://localhost:${testPort}/auth/providers`);
    const data = await response.json();
    if (data.ok && Array.isArray(data.providers)) {
      console.log('✅ GET /auth/providers - OK');
    } else {
      console.log('❌ GET /auth/providers - Failed');
    }
  } catch (error) {
    console.log('❌ GET /auth/providers - Error:', error.message);
  }

  // Test 2: POST /auth/providers
  try {
    const response = await fetch(`http://localhost:${testPort}/auth/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'GOOGLE',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKey: 'test-key'
      })
    });
    const data = await response.json();
    if (data.ok) {
      console.log('✅ POST /auth/providers - OK');
    } else {
      console.log('❌ POST /auth/providers - Failed');
    }
  } catch (error) {
    console.log('❌ POST /auth/providers - Error:', error.message);
  }

  console.log('\n🎉 Auth Tree GUI test setup complete!');
  console.log(`🌐 Open http://localhost:${testPort}/auth-tree in your browser to test the GUI`);
  console.log('🛑 Press Ctrl+C to stop the test server\n');

  // Keep server running for manual testing
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down test server...');
    server.close(() => {
      console.log('✅ Test server stopped');
      process.exit(0);
    });
  });
}

// Run the test
testAuthTreeGUI().catch(console.error);