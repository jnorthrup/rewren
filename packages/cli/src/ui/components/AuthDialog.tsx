/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ProviderDualPane } from './ProviderDualPane.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType, Config, ProviderTreeRoot } from '@wren-coder/wren-coder-cli-core';
import { Box, Text } from 'ink';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
  config: Config;
}

export function AuthDialog({
  onSelect,
  settings: _settings,
  config,
}: AuthDialogProps): React.JSX.Element {
  const [tree] = useState(() => new ProviderTreeRoot());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    tree.initialize().then(() => setInitialized(true));
  }, [tree]);

  if (!initialized) {
    return (
      <Box>
        <Text>Loading providers...</Text>
      </Box>
    );
  }

  return (
    <ProviderDualPane
      tree={tree}
      onClose={() => onSelect(undefined, SettingScope.User)}
      onSelect={(path) => {
        // Parse path to determine auth type and model
        const parts = path.split('/').filter(p => p.length > 0);
        if (parts.length >= 3) {
          const [_quota, provider, model] = parts;
          
          // Update the model configuration
          config.setModel(model);
          
          // For now, determine auth type based on provider
          let authType = AuthType.USE_OPENAI_COMPATIBLE;
          if (provider.includes('google') || provider.includes('gemini')) {
            authType = AuthType.USE_GEMINI;
          } else if (provider.includes('vertex')) {
            authType = AuthType.USE_VERTEX_AI;
          }
          
          onSelect(authType, SettingScope.User);
        } else {
          // Fallback for incomplete selections
          onSelect(AuthType.USE_OPENAI_COMPATIBLE, SettingScope.User);
        }
      }}
    />
  );
}
