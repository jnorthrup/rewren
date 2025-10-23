/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    __AUTH_TREE_NO_AUTO_START__?: boolean;
  }
}

if (typeof window !== 'undefined') {
  window.__AUTH_TREE_NO_AUTO_START__ = true;
}

export {};
