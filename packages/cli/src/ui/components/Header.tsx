/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import * as path from 'path';

interface HeaderProps {
  version: string;
  currentPath: string;
}

export const Header: React.FC<HeaderProps> = ({ version, currentPath }) => {
  const shortPath = path.basename(currentPath) || currentPath;

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box width="60%">
        <Text color="cyan" bold>
          Wren Coder {version}
        </Text>
      </Box>
      <Box width="40%" justifyContent="flex-end">
        <Text color="gray">
          📁 {shortPath}
        </Text>
      </Box>
    </Box>
  );
};
