/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { startIDEServer } from './ide-server.js';
import { setOutputChannel } from './tracing.js';

export async function activate(context: vscode.ExtensionContext) {
  // Create an Output channel for the extension and expose it to tracing.
  const channel = vscode.window.createOutputChannel('Wren IDE Companion');
  setOutputChannel(channel);
  // Optionally show the channel on activation if the user wants immediate visibility.
  // channel.show(false);

  context.subscriptions.push(channel);

  startIDEServer(context);
}

export function deactivate() {
  // Nothing special to clean up; VSCode disposes subscriptions on deactivate.
}
