/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'change the auth method',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    // Open the providers dialog so `/auth` shows the provider tree (not the legacy AuthDialog)
    dialog: 'providers',
  }),
};
