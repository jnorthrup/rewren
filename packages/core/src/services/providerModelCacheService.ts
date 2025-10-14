/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Providers } from '../config/providers.js';

/**
 * Small helper service to ensure we call /v1/models for a provider once per
 * session (process run) and rely on the existing persistent cache in
 * modelDiscovery.ts for cross-session persistence.
 */
export class ProviderModelCacheService {
  private static fetched = new Set<string>();

  /**
   * Ensure models for a provider/baseURL are fetched at least once this session.
   * This is fire-and-forget friendly and will not throw on errors.
   */
  static async ensureModelsFetchedFor(baseURL: string | undefined, apiKey: string | undefined, provider: Providers): Promise<void> {
    if (!baseURL || !apiKey) return;
    const key = `${provider}::${baseURL}`;
    if (this.fetched.has(key)) return;
    this.fetched.add(key);

    try {
      const { fetchModelsFromProvider } = await import('../config/modelDiscovery.js');
      await fetchModelsFromProvider(baseURL, apiKey, provider);
    } catch (_err) {
      // Best-effort; do not fail startup if model discovery fails.
    }
  }
}

export default ProviderModelCacheService;
