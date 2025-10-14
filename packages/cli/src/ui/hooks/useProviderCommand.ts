/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { LoadedSettings } from '../../config/settings.js';

interface UseProviderCommandReturn {
  isProviderDialogOpen: boolean;
  openProviderDialog: () => void;
  handleProviderSelect: (value: boolean) => void;
}

export const useProviderCommand = (
  _settings: LoadedSettings,
  _setProviderError: (error: string | null) => void,
): UseProviderCommandReturn => {
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  const openProviderDialog = useCallback(() => {
    setIsProviderDialogOpen(true);
  }, []);

  const handleProviderSelect = useCallback((value: boolean) => {
    if (value === undefined) {
      setIsProviderDialogOpen(false);
    } else {
      // Handle provider selection if needed
      setIsProviderDialogOpen(false);
    }
  }, []);

  return {
    isProviderDialogOpen,
    openProviderDialog,
    handleProviderSelect,
  };
};