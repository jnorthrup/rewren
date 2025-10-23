/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { LoadedSettings } from '../../config/settings.js';
import { Config } from '@wren-coder/wren-coder-cli-core';

interface AuthDialogProps {
  onSelect: (value: any) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
  config: Config;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({
  onSelect,
  settings,
  initialErrorMessage,
  config,
}) => {
  return (
    <Box flexDirection="column">
      <Text>Authentication dialog (placeholder)</Text>
      {initialErrorMessage && (
        <Text color="red">{initialErrorMessage}</Text>
      )}
    </Box>
  );
};