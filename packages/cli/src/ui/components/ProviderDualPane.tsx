/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProviderTreeRoot, ModelNode, JsonGraphCRUD, TreeNode } from '@wren-coder/wren-coder-cli-core';

interface ProviderDualPaneProps {
  tree: ProviderTreeRoot;
  onClose: () => void;
  onSelect?: (path: string) => void;
}

type PathSegment = {
  quota?: string;
  provider?: string;
  model?: string;
};

export const ProviderDualPane: React.FC<ProviderDualPaneProps> = ({ tree, onClose, onSelect }) => {
  const [path, setPath] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchCursorPos, setSearchCursorPos] = useState<number>(0);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [detailsScrollOffset, setDetailsScrollOffset] = useState<number>(0);
  const [showCRUD, setShowCRUD] = useState<boolean>(false);
  const [starredModels, setStarredModels] = useState<Set<string>>(new Set());
  const [crud] = useState(() => new JsonGraphCRUD(tree));

  // Parse path into segments
  // Handle model names with slashes (e.g., "openai/gpt-oss-120b")
  const parsePath = (pathStr: string): PathSegment => {
    const parts = pathStr.split('/').filter(p => p.length > 0);
    return {
      quota: parts[0],
      provider: parts[1],
      model: parts.slice(2).join('/'), // Join remaining parts for models with slashes
    };
  };

  const segments = parsePath(path);

  // Get current list items based on path
  const getListItems = (): string[] => {
    if (!segments.quota) {
      // Root level: show quotas with annotations
      return Array.from(tree.quotas.keys()).map(q =>
        q === 'identity' ? 'identity ε' : q
      );
    }

    if (!segments.provider) {
      // Quota level: show all providers in this quota (even without keys)
      const quota = tree.getQuota(segments.quota);
      if (!quota) return [];

      return Array.from(quota.providers.values())
        .filter(p => p.enabled)
        .map(p => {
          const hasKey = p.hasApiKey ? '' : ' ⚠';
          return `${p.provider}${hasKey}`;
        });
    }

    if (!segments.model) {
      // Provider level: show models
      const quota = tree.getQuota(segments.quota);
      if (!quota) return [];

      const provider = quota.getProvider(segments.provider);
      if (!provider) return [];

      const modelsNode = provider.children.find(c => c.type === 'models');
      if (!modelsNode || modelsNode.children.length === 0) return [];

      return modelsNode.children.map(m => {
        const modelName = (m as ModelNode).model.name;
        const isStarred = starredModels.has(`${segments.quota}/${segments.provider}/${modelName}`);
        return isStarred ? `${modelName} ⭐` : modelName;
      });
    }

    return [];
  };

  const items = getListItems();
  const filteredItems = searchInput
    ? items.filter(item => item.toLowerCase().includes(searchInput.toLowerCase()))
    : items;

  // Get hierarchy labels (squeezed left, accumulating as we go deeper)
  const getHierarchyLabels = (): string[] => {
    const parts = path.split('/').filter(p => p.length > 0);
    const labels: string[] = [];
    
    if (parts.length >= 1 && parts[0] !== 'identity') {
      labels.push(parts[0]); // Quota label (non-identity only)
    }
    
    if (parts.length >= 2) {
      labels.push(parts[1]); // Provider label
    }
    
    if (parts.length >= 3) {
      labels.push(parts[2]); // Model label
    }
    
    return labels;
  };

  // Get label for current context (only for identity quota)
  const getLabel = (): string => {
    if (!segments.quota) return 'Quotas';
    if (!segments.provider) {
      // Only show label for identity quota
      return segments.quota === 'identity' ? '' : `Providers (${segments.quota})`;
    }
    if (!segments.model) return `Models (${segments.provider})`;
    return 'Details';
  };

  // Get tree level indicator
  const getTreeLevel = (): string => {
    if (!segments.quota) return 'Quota';
    if (!segments.provider) return 'Provider';
    if (!segments.model) return 'Model';
    return 'Details';
  };

  // Get current node for details
  const getCurrentNode = (): TreeNode | null => {
    if (!segments.quota) return null;

    const quota = tree.getQuota(segments.quota);
    if (!quota) return null;

    if (!segments.provider) return quota;

    const provider = quota.getProvider(segments.provider);
    if (!provider) return null;

    if (!segments.model) return provider;

    const modelsNode = provider.children.find(c => c.type === 'models');
    if (!modelsNode) return null;

    const modelNode = modelsNode.children.find(m => (m as ModelNode).model.name === segments.model);
    return modelNode || null;
  };

  // Get details lines for scrollable view
  const getDetailsLines = (): string[] => {
    const node = getCurrentNode();
    if (!node) return ['Select a node to view details'];

    const lines: string[] = [];
    const json = node.toJSON();

    lines.push(`Node Type: ${node.type}`);
    lines.push(`Node ID: ${node.id}`);
    lines.push(`Label: ${node.label}`);
    lines.push('');
    lines.push('--- JSON Representation ---');

    // Pretty print JSON with proper indentation
    const jsonStr = JSON.stringify(json, null, 2);
    lines.push(...jsonStr.split('\n'));

    if (showCRUD) {
      lines.push('');
      lines.push('--- CRUD Operations ---');
      lines.push('[U] Update Node');
      lines.push('[D] Delete Node');
      lines.push('[R] Refresh');
      lines.push('[C] Toggle CRUD');
    }

    return lines;
  };

  // Get status bar text
  const getStatus = (): string => {
    const pathDisplay = path || '(root)';
    const countStr = `${filteredItems.length}/${items.length} items`;
    const selectedItem = filteredItems[selectedIndex];
    const selectionStr = selectedItem ? ` • ${selectedItem}` : '';
    const modeStr = isSearchMode ? ' [SEARCH]' : '';
    const scrollStr = filteredItems.length > 10 ? ` (${scrollOffset + 1}-${Math.min(scrollOffset + 10, filteredItems.length)})` : '';
    const crudStr = showCRUD ? ' [CRUD]' : '';
    const starStr = segments.provider && !segments.model ? ' • [S/*] star' : '';
    return `${pathDisplay}${modeStr}${crudStr} • ${countStr}${scrollStr}${selectionStr} • [→/SPC] next • [←] back • [/] search • [C] CRUD${starStr}`;
  };

  // Handle navigation
  const handleNavigate = (item: string) => {
    if (!segments.quota) {
      // Navigate to quota - strip annotation
      const quotaName = item.replace(' ε', '');
      setPath(`${quotaName}/`);
      setSelectedIndex(0);
    } else if (!segments.provider) {
      // Navigate to provider - strip warning marker and show models
      const providerName = item.replace(' ⚠', '');
      setPath(`${segments.quota}/${providerName}/`);
      setSelectedIndex(0);
    } else if (!segments.model) {
      // Navigate to model - select it
      const modelName = item.replace(' ⭐', ''); // Strip star
      const selectionPath = `${segments.quota}/${segments.provider}/${modelName}`;
      console.error('[ProviderDualPane] Selecting model, path:', selectionPath);
      console.error('[ProviderDualPane] onSelect callback exists:', !!onSelect);
      setPath(`${selectionPath}/`);
      setSelectedIndex(0);
      if (onSelect) {
        console.error('[ProviderDualPane] Calling onSelect with:', selectionPath);
        onSelect(selectionPath);
      }
    }
  };

  // Handle key input with Ink's useInput hook
  useInput((input, key) => {
    if (key.escape) {
      if (isSearchMode) {
        setIsSearchMode(false);
        setSearchInput('');
      } else {
        onClose();
      }
      return;
    }

    if (isSearchMode) {
      // Search mode: typing to filter
      if (key.return) {
        // Enter selects the current item but does NOT exit search mode
        const selectedItem = filteredItems[selectedIndex];
        if (selectedItem) {
          handleNavigate(selectedItem);
        }
        // Keep search mode active - don't exit
      } else if (key.leftArrow) {
        // Move cursor left in search input
        setSearchCursorPos(prev => Math.max(0, prev - 1));
      } else if (key.rightArrow) {
        // Move cursor right in search input
        setSearchCursorPos(prev => Math.min(searchInput.length, prev + 1));
      } else if (key.upArrow) {
        // Navigate up in filtered results
        setSelectedIndex(prev => {
          const newIdx = Math.max(0, prev - 1);
          // Scroll up if needed
          if (newIdx < scrollOffset) {
            setScrollOffset(newIdx);
          }
          return newIdx;
        });
      } else if (key.downArrow) {
        // Navigate down in filtered results
        setSelectedIndex(prev => {
          const newIdx = Math.min(filteredItems.length - 1, prev + 1);
          // Scroll down if needed (assuming 10 visible items)
          const visibleLines = 10;
          if (newIdx >= scrollOffset + visibleLines) {
            setScrollOffset(newIdx - visibleLines + 1);
          }
          return newIdx;
        });
      } else if (key.backspace || key.delete) {
        if (searchCursorPos > 0) {
          const newInput = searchInput.slice(0, searchCursorPos - 1) + searchInput.slice(searchCursorPos);
          setSearchInput(newInput);
          setSearchCursorPos(prev => prev - 1);
        }
        setSelectedIndex(0);
      } else if (input && !key.ctrl && !key.meta) {
        // Insert character at cursor position
        const newInput = searchInput.slice(0, searchCursorPos) + input + searchInput.slice(searchCursorPos);
        setSearchInput(newInput);
        setSearchCursorPos(prev => prev + 1);
        setSelectedIndex(0);
      }
    } else {
      // Navigation mode
      if (key.upArrow) {
        setSelectedIndex(prev => {
          const newIdx = Math.max(0, prev - 1);
          // Scroll up if needed
          if (newIdx < scrollOffset) {
            setScrollOffset(newIdx);
          }
          return newIdx;
        });
      } else if (key.downArrow) {
        setSelectedIndex(prev => {
          const newIdx = Math.min(filteredItems.length - 1, prev + 1);
          // Scroll down if needed (assuming 10 visible items)
          const visibleLines = 10;
          if (newIdx >= scrollOffset + visibleLines) {
            setScrollOffset(newIdx - visibleLines + 1);
          }
          return newIdx;
        });
      } else if (key.rightArrow || input === ' ') {
        // Navigate deeper into tree (x++) - space or right arrow
        const selectedItem = filteredItems[selectedIndex];
        if (selectedItem) {
          handleNavigate(selectedItem);
          setScrollOffset(0);
        }
      } else if (key.leftArrow) {
        // Navigate back up tree (x--)
        const parts = path.split('/').filter(p => p.length > 0);
        if (parts.length > 0) {
          parts.pop();
          setPath(parts.length > 0 ? parts.join('/') + '/' : '');
          setSelectedIndex(0);
          setScrollOffset(0);
        }
      } else if (key.return) {
        // Select current model or navigate deeper
        const selectedItem = filteredItems[selectedIndex];
        if (selectedItem) {
          if (segments.model) {
            // Final selection at model level
            if (onSelect) {
              onSelect(`${segments.quota}/${segments.provider}/${selectedItem}`);
            }
          } else {
            // Navigate deeper
            handleNavigate(selectedItem);
            setScrollOffset(0);
          }
        }
      } else if (input === '/') {
        setIsSearchMode(true);
        setSearchInput('');
        setSearchCursorPos(0);
      } else if (input === 'c' || input === 'C') {
        setShowCRUD(!showCRUD);
      } else if (input === 's' || input === 'S' || input === '*') {
        // Star/unstar current model
        if (segments.provider && !segments.model) {
          const selectedItem = filteredItems[selectedIndex];
          if (selectedItem) {
            const modelName = selectedItem.replace(' ⭐', '');
            const modelKey = `${segments.quota}/${segments.provider}/${modelName}`;
            setStarredModels(prev => {
              const newSet = new Set(prev);
              if (newSet.has(modelKey)) {
                newSet.delete(modelKey);
              } else {
                newSet.add(modelKey);
              }
              return newSet;
            });
          }
        }
      } else if (key.pageDown) {
        setDetailsScrollOffset(prev => Math.min(prev + 10, Math.max(0, getDetailsLines().length - 15)));
      } else if (key.pageUp) {
        setDetailsScrollOffset(prev => Math.max(0, prev - 10));
      }
    }
  });

  // Get hierarchy breadcrumb (excluding identity)
  const _getHierarchyBreadcrumb = (): string => {
    const parts = path.split('/').filter(p => p.length > 0);
    // Filter out 'identity' quota
    const filtered = parts.filter(p => p !== 'identity');
    return filtered.length > 0 ? filtered.join(' → ') : '';
  };

  const detailsLines = getDetailsLines();
  const visibleDetailsLines = detailsLines.slice(detailsScrollOffset, detailsScrollOffset + 15);
  const hierarchyLabels = getHierarchyLabels();

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Hierarchy labels squeezed left above the list */}
      {hierarchyLabels.length > 0 && (
        <Box paddingX={1}>
          <Text dimColor>{hierarchyLabels.join(' → ')}</Text>
        </Box>
      )}

      {/* Tree level indicator (only for identity or when no hierarchy labels) */}
      {getLabel() && (
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Box justifyContent="space-between" width="100%">
            <Text bold color="cyan">{getLabel()}</Text>
            <Text dimColor color="magenta">[{getTreeLevel()}]</Text>
          </Box>
        </Box>
      )}

      {/* Main content area: Border layout with center list */}
      <Box flexDirection="row" flexGrow={1}>
        {/* CENTER: List/Navigation pane */}
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="cyan">
          {/* Path/Search display */}
          <Box paddingX={1} paddingY={1}>
            {isSearchMode ? (
              <>
                <Text dimColor>Search: </Text>
                <Text bold color="yellow">
                  {searchInput.slice(0, searchCursorPos)}
                  <Text inverse>{searchCursorPos < searchInput.length ? searchInput[searchCursorPos] : '█'}</Text>
                  {searchCursorPos < searchInput.length ? searchInput.slice(searchCursorPos + 1) : ''}
                </Text>
              </>
            ) : (
              <>
                <Text dimColor>Path: </Text>
                <Text bold>{path || '/'}</Text>
              </>
            )}
          </Box>

          {/* List box with scrolling */}
          <Box flexDirection="column" flexGrow={1} paddingX={1}>
            {filteredItems.length === 0 ? (
              <Text dimColor>No items</Text>
            ) : (
              filteredItems.slice(scrollOffset, scrollOffset + 10).map((item, displayIdx) => {
                const actualIdx = scrollOffset + displayIdx;
                const isSelected = actualIdx === selectedIndex;
                return (
                  <Text key={item} inverse={isSelected}>
                    {isSelected ? '▶ ' : '  '}{item}
                  </Text>
                );
              })
            )}
          </Box>
        </Box>

        {/* RIGHT: Scrollable details pane with CRUD */}
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="gray">
          <Box paddingX={1} justifyContent="space-between">
            <Text bold color="cyan">Details</Text>
            {showCRUD && <Text color="yellow">[CRUD]</Text>}
          </Box>

          {/* Scrollable details content */}
          <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
            {visibleDetailsLines.map((line, idx) => (
              <Text key={idx} dimColor={line.startsWith('---')}>{line}</Text>
            ))}
          </Box>

          {/* Scroll indicator */}
          {detailsLines.length > 15 && (
            <Box paddingX={1}>
              <Text dimColor>
                ({detailsScrollOffset + 1}-{Math.min(detailsScrollOffset + 15, detailsLines.length)}/{detailsLines.length})
                [PgUp/PgDn]
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* BOTTOM: Status bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{getStatus()}</Text>
      </Box>
    </Box>
  );
};
