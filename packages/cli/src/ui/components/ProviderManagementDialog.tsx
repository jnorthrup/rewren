/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { ProviderConfigService, ProviderConfig, Providers, ApiKeyService, QuotaService } from '@wren-coder/wren-coder-cli-core';

interface ProviderManagementDialogProps {
  onExit: () => void;
}

// Default base URLs for providers
const DEFAULT_BASE_URLS: Record<string, string> = {
  [Providers.OPENAI]: 'https://api.openai.com/v1',
  [Providers.OPENROUTER]: 'https://openrouter.ai/api/v1',
  [Providers.NVIDIA]: 'https://integrate.api.nvidia.com/v1',
  [Providers.KILO]: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
  [Providers.GROQ]: 'https://api.groq.com/openai/v1',
  [Providers.DEEPSEEK]: 'https://api.deepseek.com/v1',
  [Providers.QWEN]: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  [Providers.MOONSHOT_AI]: 'https://api.moonshot.ai/v1',
};

function getDefaultBaseURL(provider: Providers): string {
  return DEFAULT_BASE_URLS[provider] || 'https://api.example.com/v1';
}

export function ProviderManagementDialog({
  onExit,
}: ProviderManagementDialogProps): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'edit' | 'create' | 'delete-confirm'>('list');
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState<number>(0);
  const [apiKeyService] = useState(() => new ApiKeyService());
  const [quotaService] = useState(() => new QuotaService(apiKeyService));
  
  // Refresh providers list
  useEffect(() => {
    const allProviders = ProviderConfigService.getAllProviders();
    setProviders(allProviders);
  }, []);

  const refreshProviders = () => {
    const allProviders = ProviderConfigService.getAllProviders();
    setProviders(allProviders);
  };

  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
    
    if (currentView === 'list') {
      if (key.return || input === 'd') { // Detail view
        if (providers.length > 0) {
          setSelectedProvider(providers[selectedProviderIndex]);
          setCurrentView('detail');
        }
      } else if (input === 'e') { // Edit view
        if (providers.length > 0) {
          setSelectedProvider(providers[selectedProviderIndex]);
          setCurrentView('edit');
        }
      } else if (input === 'c') { // Create view
        setCurrentView('create');
      } else if (input === 'r') { // Refresh
        refreshProviders();
      }
    } else if (currentView === 'detail' || currentView === 'edit' || currentView === 'create' || currentView === 'delete-confirm') {
      if (key.return || input === 'l') { // Back to list
        setCurrentView('list');
        setSelectedProvider(null);
      }
      if (currentView === 'edit' && selectedProvider) {
        // Handle edit actions
        if (input === '1') { // Toggle enable/disable
          const newEnabled = !selectedProvider.enabled;
          ProviderConfigService.updateProvider(selectedProvider.provider, { enabled: newEnabled });
          refreshProviders();
          setCurrentView('list');
          setSelectedProvider(null);
        } else if (input === '5') { // Delete provider
          setCurrentView('delete-confirm');
        } else if (input === '6') { // Health check
          // Note: Health check is async, but we can't await in useInput
          // In a real implementation, this would need to be handled differently
          ProviderConfigService.testProviderHealth(selectedProvider.provider)
            .then((healthy) => {
              console.log(`Provider ${selectedProvider.provider} health check: ${healthy ? 'PASS' : 'FAIL'}`);
            })
            .catch((error) => {
              console.error(`Health check error:`, error);
            });
        } else if (input === '7') { // Configure quota limits
          // For now, set some default quota limits as a placeholder
          // In a real implementation, this would prompt for user input
          quotaService.createOrUpdateQuota(selectedProvider.provider, {
            requestsPerMinute: 60,
            requestsPerDay: 1000,
            tokensPerMinute: 10000,
            tokensPerDay: 100000
          });
          console.log(`Set default quota limits for ${selectedProvider.provider}`);
        } else if (input === '8') { // Reset quota usage
          quotaService.resetUsage(selectedProvider.provider);
          console.log(`Reset quota usage for ${selectedProvider.provider}`);
        }
        if (input === 'y' || input === 'Y') { // Confirm deletion
          ProviderConfigService.deleteProvider(selectedProvider.provider);
          refreshProviders();
          setCurrentView('list');
          setSelectedProvider(null);
        } else if (input === 'n' || input === 'N' || key.return || input === 'l') { // Cancel
          setCurrentView('edit');
        }
      }
    }
  });

  // Format stats for display
  const formatStats = (provider: ProviderConfig) => {
    const perf = provider.performance;
    if (!perf) {
      return "No stats available";
    }
    
    return `Success: ${perf.successCount}, Failed: ${perf.failureCount}, ` +
           `Avg. Latency: ${Math.round(perf.avgLatencyMs)}ms, ` +
           `Error Rate: ${(perf.errorRate * 100).toFixed(1)}%, ` +
           `Bayes Weight: ${provider.bayesWeight?.toFixed(2) || 'N/A'}`;
  };

  if (currentView === 'list') {
    if (providers.length === 0) {
      return (
        <Box
          borderStyle="round"
          borderColor={Colors.Gray}
          flexDirection="column"
          padding={1}
          width="100%"
        >
          <Text bold>Provider Management</Text>
          <Box marginTop={1}>
            <Text>No providers configured yet.</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Add providers using the /auth command or directly through the API.</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={Colors.AccentPurple}>Press Esc to exit</Text>
          </Box>
        </Box>
      );
    }

    const providerItems = providers.map((provider, index) => ({
      label: `${provider.provider} (${provider.enabled ? 'ENABLED' : 'DISABLED'}) - ${formatStats(provider)}`,
      value: index.toString(),
    }));

    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Provider Management - All Providers</Text>
        <Box marginTop={1}>
          <Text>Select a provider to view details (Enter/D for details, E to edit):</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={providerItems}
            initialIndex={selectedProviderIndex}
            onSelect={(value) => {
              const index = parseInt(value, 10);
              setSelectedProviderIndex(index);
              setSelectedProvider(providers[index]);
            }}
            isFocused={true}
          />
        </Box>
        <Box marginTop={1} flexDirection="row" gap={1}>
          <Text color={Colors.AccentGreen} bold>Enter/D</Text>
          <Text>Details </Text>
          <Text color={Colors.AccentBlue} bold>E</Text>
          <Text>Edit </Text>
          <Text color={Colors.AccentYellow} bold>C</Text>
          <Text>Create </Text>
          <Text color={Colors.AccentPurple} bold>R</Text>
          <Text>Refresh </Text>
          <Text color={Colors.AccentRed} bold>Esc</Text>
          <Text>Exit</Text>
        </Box>
      </Box>
    );
  } else if (currentView === 'detail' && selectedProvider) {
    const perf = selectedProvider.performance;
    const quotaLimits = quotaService.getQuota(selectedProvider.provider);
    const quotaUsage = quotaService.getUsage(selectedProvider.provider);
    const isQuotaExceeded = quotaService.isQuotaExceeded(selectedProvider.provider);
    
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Provider Details: {selectedProvider.provider}</Text>
        <Box marginTop={1}>
          <Text>Base URL: {selectedProvider.baseURL}</Text>
        </Box>
        {selectedProvider.apiKey && (
          <Box marginTop={1}>
            <Text>API Key: ***{selectedProvider.apiKey.slice(-4)}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>Enabled: {selectedProvider.enabled ? 'Yes' : 'No'}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Bayes Weight: {selectedProvider.bayesWeight?.toFixed(2) || 'N/A'}</Text>
        </Box>
        {perf && (
          <Box marginTop={1} flexDirection="column">
            <Text>Performance Stats:</Text>
            <Text>  • Total Requests: {perf.totalRequests}</Text>
            <Text>  • Success Count: {perf.successCount}</Text>
            <Text>  • Failure Count: {perf.failureCount}</Text>
            <Text>  • Success Rate: {perf.totalRequests > 0 ? ((perf.successCount / perf.totalRequests) * 100).toFixed(1) + '%' : 'N/A'}</Text>
            <Text>  • Avg. Latency: {Math.round(perf.avgLatencyMs)} ms</Text>
            <Text>  • Error Rate: {(perf.errorRate * 100).toFixed(1)}%</Text>
            <Text>  • Avg. Tokens/Sec: {perf.avgTokenPerSecond.toFixed(2)}</Text>
            <Text>  • Last Used: {perf.lastUsed ? perf.lastUsed.toLocaleString() : 'Never'}</Text>
            <Text>  • Last Success: {perf.lastSuccess ? perf.lastSuccess.toLocaleString() : 'Never'}</Text>
            <Text>  • Last Failure: {perf.lastFailure ? perf.lastFailure.toLocaleString() : 'Never'}</Text>
          </Box>
        )}
        {quotaLimits && (
          <Box marginTop={1} flexDirection="column">
            <Text color={isQuotaExceeded ? Colors.AccentRed : Colors.AccentGreen}>
              Quota Status: {isQuotaExceeded ? 'EXCEEDED' : 'OK'}
            </Text>
            <Text>Quota Limits:</Text>
            {quotaLimits.requestsPerMinute && (
              <Text>  • Requests/Min: {quotaUsage.requests.minute}/{quotaLimits.requestsPerMinute}</Text>
            )}
            {quotaLimits.requestsPerDay && (
              <Text>  • Requests/Day: {quotaUsage.requests.day}/{quotaLimits.requestsPerDay}</Text>
            )}
            {quotaLimits.tokensPerMinute && (
              <Text>  • Tokens/Min: {quotaUsage.tokens.minute}/{quotaLimits.tokensPerMinute}</Text>
            )}
            {quotaLimits.tokensPerDay && (
              <Text>  • Tokens/Day: {quotaUsage.tokens.day}/{quotaLimits.tokensPerDay}</Text>
            )}
          </Box>
        )}
        <Box marginTop={1} flexDirection="row" gap={1}>
          <Text color={Colors.AccentGreen} bold>Enter/L</Text>
          <Text>Back to list</Text>
          <Text color={Colors.AccentRed} bold>Esc</Text>
          <Text>Exit</Text>
        </Box>
      </Box>
    );
  } else if (currentView === 'edit' && selectedProvider) {
    // Implement actual editing functionality
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Provider Edit: {selectedProvider.provider}</Text>
        <Box marginTop={1}>
          <Text>Current Configuration:</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Base URL: {selectedProvider.baseURL}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>API Key: {selectedProvider.apiKey ? '***' + selectedProvider.apiKey.slice(-4) : 'Not set'}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Enabled: {selectedProvider.enabled ? 'Yes' : 'No'}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Bayes Weight: {selectedProvider.bayesWeight?.toFixed(2) || 'N/A'}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.AccentYellow}>Available Actions:</Text>
        </Box>
        <Box marginTop={1} flexDirection="column" gap={1}>
          <Text>1. Toggle Enable/Disable</Text>
          <Text>2. Update API Key</Text>
          <Text>3. Update Base URL</Text>
          <Text>4. Reset Performance Stats</Text>
          <Text>5. Delete Provider</Text>
          <Text>6. Test Health Check</Text>
          <Text>7. Configure Quota Limits</Text>
          <Text>8. Reset Quota Usage</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Colors.AccentPurple}>Press 1-8 to select action, or Esc to go back</Text>
        </Box>
      </Box>
    );
  } else if (currentView === 'create') {
    // Show available providers that can be created
    const availableProviders = Object.values(Providers).filter(provider => 
      !providers.some(p => p.provider === provider)
    );

    if (availableProviders.length === 0) {
      return (
        <Box
          borderStyle="round"
          borderColor={Colors.Gray}
          flexDirection="column"
          padding={1}
          width="100%"
        >
          <Text bold>Provider Creation</Text>
          <Box marginTop={1}>
            <Text>All available providers are already configured.</Text>
          </Box>
          <Box marginTop={1} flexDirection="row" gap={1}>
            <Text color={Colors.AccentGreen} bold>Enter/L</Text>
            <Text>Back to list</Text>
            <Text color={Colors.AccentRed} bold>Esc</Text>
            <Text>Exit</Text>
          </Box>
        </Box>
      );
    }

    const providerItems = availableProviders.map((provider, index) => ({
      label: provider,
      value: index.toString(),
    }));

    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Provider Creation</Text>
        <Box marginTop={1}>
          <Text>Select a provider to add:</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={providerItems}
            initialIndex={0}
            onSelect={(value) => {
              const index = parseInt(value, 10);
              const selectedProviderType = availableProviders[index];
              
              // Create provider with default settings
              const defaultBaseURL = getDefaultBaseURL(selectedProviderType);
              const success = ProviderConfigService.createProvider(selectedProviderType, defaultBaseURL);
              
              if (success) {
                refreshProviders();
                setCurrentView('list');
              }
            }}
            isFocused={true}
          />
        </Box>
        <Box marginTop={1} flexDirection="row" gap={1}>
          <Text color={Colors.AccentGreen} bold>Enter</Text>
          <Text>Create provider </Text>
          <Text color={Colors.AccentBlue} bold>L</Text>
          <Text>Back to list </Text>
          <Text color={Colors.AccentRed} bold>Esc</Text>
          <Text>Exit</Text>
        </Box>
      </Box>
    );
  } else if (currentView === 'delete-confirm' && selectedProvider) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.AccentRed}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold color={Colors.AccentRed}>⚠️  Confirm Provider Deletion</Text>
        <Box marginTop={1}>
          <Text>Are you sure you want to delete the provider &quot;{selectedProvider.provider}&quot;?</Text>
        </Box>
        <Box marginTop={1}>
          <Text>This action cannot be undone.</Text>
        </Box>
        <Box marginTop={1}>
          <Text>All configuration and performance data will be lost.</Text>
        </Box>
        <Box marginTop={1} flexDirection="row" gap={1}>
          <Text color={Colors.AccentRed} bold>Y</Text>
          <Text>Yes, delete provider </Text>
          <Text color={Colors.AccentGreen} bold>N</Text>
          <Text>No, cancel </Text>
          <Text color={Colors.AccentBlue} bold>L</Text>
          <Text>Back to list</Text>
        </Box>
      </Box>
    );
  }

  // Fallback
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Provider Management</Text>
      <Box marginTop={1}>
        <Text>Error: Invalid view state</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentRed} bold>Press Esc to exit</Text>
      </Box>
    </Box>
  );
}