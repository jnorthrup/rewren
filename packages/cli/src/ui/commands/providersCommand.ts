/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const providersCommand: SlashCommand = {
  name: 'providers',
  description: 'manage provider configurations and view performance stats',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'providers',
  }),
};