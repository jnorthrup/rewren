/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useRef } from 'react';
import { LoadedSettings } from '../../config/settings.js';

interface UseProviderCommandReturn {
  isProviderDialogOpen: boolean;
  openProviderDialog: () => void;
  handleProviderSelect: (value: boolean) => void;
}

export const useProviderCommand = (
  _settings: LoadedSettings,
): UseProviderCommandReturn => {
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  // Prevent immediate reopen after close (e.g., due to keypress bleed-through or state changes)
  const lastClosedAtRef = useRef<number | null>(null);
  const REOPEN_COOLDOWN_MS = 500; // Increased from 250ms to 500ms

  const openProviderDialog = useCallback(() => {
    const now = Date.now();
    if (
      lastClosedAtRef.current &&
      now - lastClosedAtRef.current < REOPEN_COOLDOWN_MS
    ) {
  void import('../utils/tracer.js').then(({ info }) => info('[useProviderCommand] openProviderDialog suppressed by cooldown, time remaining:', (lastClosedAtRef.current! + REOPEN_COOLDOWN_MS - now), 'ms'));
      return;
    }
  void import('../utils/tracer.js').then(({ info }) => info('[useProviderCommand] opening provider dialog'));
    setIsProviderDialogOpen(true);
  }, []);

  const handleProviderSelect = useCallback((_value: boolean) => {
    // Close the dialog and record the time so we can avoid immediate reopen.
  void import('../utils/tracer.js').then(({ info }) => info('[useProviderCommand] handleProviderSelect called, closing dialog'));
    setIsProviderDialogOpen(false);
    lastClosedAtRef.current = Date.now();
  void import('../utils/tracer.js').then(({ info }) => info('[useProviderCommand] dialog closed, cooldown set until:', new Date(lastClosedAtRef.current! + REOPEN_COOLDOWN_MS).toISOString()));
  }, []);

  return {
    isProviderDialogOpen,
    openProviderDialog,
    handleProviderSelect,
  };
};