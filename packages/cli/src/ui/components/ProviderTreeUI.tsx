/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider Tree UI using actual TreeNode classes with serde support
 * API Keys stored in environment variables only
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import * as path from 'node:path';
import { Colors } from '../colors.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  ProviderTreeRoot,
  TreeNode,
  ModelsNode,
  ProviderNode,
  MetricsNode,
  QuotaNode,
  UsageNode,
  ConfigNode,
  ModelNode,
  JsonGraphCRUD
} from '@wren-coder/wren-coder-cli-core';

const TREE_SAVE_PATH = path.join('.wren', 'provider-tree.json');

interface ProviderTreeUIProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  config: Config;
  onClose?: () => void;
  onModelChange?: (model: string) => void;
  availableTerminalHeight?: number;
  terminalWidth?: number;
}

export function ProviderTreeUI({ onSelect: _onSelect, config, onClose, onModelChange, availableTerminalHeight, terminalWidth }: ProviderTreeUIProps) {
  const [treeRoot] = useState(() => new ProviderTreeRoot());
  const [crud] = useState(() => new JsonGraphCRUD(treeRoot));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const rescanTimer = useRef<NodeJS.Timeout | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // JSON editor state
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false);
  const [jsonEditorContent, setJsonEditorContent] = useState('');
  const [jsonEditorNodeId, setJsonEditorNodeId] = useState<string>('');

  // Scroll state for both panes
  const [treeScrollOffset, setTreeScrollOffset] = useState(0);
  const [crudScrollOffset, setCrudScrollOffset] = useState(0);
  const MAX_VISIBLE_TREE_ITEMS = 12;
  const MAX_VISIBLE_CRUD_LINES = 15;

  // Helper: persistence and rescan (stable callbacks)
  const saveTreeToDisk = useCallback(async () => {
    try {
      await treeRoot.saveToFile(TREE_SAVE_PATH);
      setStatusMessage('✅ Saved to disk');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (e) {
      setStatusMessage(`❌ Save failed: ${e}`);
      console.error('Failed to save provider tree:', e);
    }
  }, [treeRoot]);

  const loadTreeFromDisk = useCallback(async () => {
    try {
      const loaded = await treeRoot.loadFromFile(TREE_SAVE_PATH);
      if (loaded) {
        setStatusMessage('✅ Loaded from disk');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    } catch (e) {
      setStatusMessage(`❌ Load failed: ${e}`);
      console.error('Failed to load provider tree:', e);
    }
  }, [treeRoot]);

  const scheduleRescan = useCallback(() => {
    if (rescanTimer.current) clearTimeout(rescanTimer.current);
    rescanTimer.current = setTimeout(() => {
      treeRoot.initialize().catch(console.error);
      rescanTimer.current = null;
    }, 500);
  }, [treeRoot]);
  // Initialize tree with models and load persisted state
  useEffect(() => {
    const initTree = async () => {
      try {
        await treeRoot.initialize();
        setStatusMessage(`✅ Loaded ${treeRoot.providers.size} providers`);
        setTimeout(() => setStatusMessage(''), 2000);
      } catch (error) {
        setStatusMessage(`❌ Init failed: ${error}`);
        console.error('Tree initialization error:', error);
      }
    };
    initTree();
    loadTreeFromDisk();
  }, [treeRoot, loadTreeFromDisk]);

    // Flatten tree for navigation
  const flattenTree = (node: TreeNode, depth = 0, parent?: TreeNode): Array<{node: TreeNode, depth: number, parent?: TreeNode}> => {
    const result: Array<{node: TreeNode, depth: number, parent?: TreeNode}> = [{node, depth, parent}];

    if (expandedNodes.has(node.id)) {
      for (const child of node.children) {
        // Filter models based on search query
        if (node.type === 'models' && searchQuery) {
          if (child.label.toLowerCase().includes(searchQuery.toLowerCase())) {
            result.push({node: child, depth: depth + 1, parent: node});
          }
        } else {
          const childResults = flattenTree(child, depth + 1, node);
          result.push(...childResults);
        }
      }
    }

    return result;
  };

  const flatNodes = flattenTree(treeRoot);
  const selectedNode = flatNodes[selectedIndex]?.node;
  const selectedParent = flatNodes[selectedIndex]?.parent;

  // Handle keyboard input
  useInput((input, key) => {
    // JSON editor mode takes precedence
    if (isJsonEditorOpen) {
      if (key.escape) {
        // Cancel and close editor
        setIsJsonEditorOpen(false);
        setJsonEditorContent('');
        setJsonEditorNodeId('');
      } else if (key.return && key.ctrl) {
        // Ctrl+Enter: Save JSON changes
        try {
          const parsed = JSON.parse(jsonEditorContent);
          const result = crud.updateNode(jsonEditorNodeId, parsed);
          setStatusMessage(result.message);
          if (result.success) {
            saveTreeToDisk();
            setIsJsonEditorOpen(false);
            setJsonEditorContent('');
            setJsonEditorNodeId('');
          }
        } catch (err) {
          setStatusMessage(`❌ Invalid JSON: ${err}`);
        }
      } else if (key.backspace || key.delete) {
        setJsonEditorContent(prev => prev.slice(0, -1));
      } else if (key.return) {
        setJsonEditorContent(prev => prev + '\n');
      } else if (input && !key.ctrl && !key.meta) {
        setJsonEditorContent(prev => prev + input);
      }
      return;
    }

    if (isSearchMode) {
      if (key.escape) {
        setIsSearchMode(false);
        setSearchQuery('');
      } else if (key.backspace || key.delete) {
        setSearchQuery(prev => prev.slice(0, -1));
      } else if (key.return) {
        setIsSearchMode(false);
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery(prev => prev + input);
      }
      return;
    }
    if (isEditMode) {
      if (key.return) {
        // Save edit via CRUD
        if (selectedNode) {
          const updates: Record<string, string> = { [editField]: editValue };
          const result = crud.updateNode(selectedNode.id, updates);
          setStatusMessage(result.message);
          if (result.success) {
            saveTreeToDisk();
          }
        }
        setIsEditMode(false);
        setEditField('');
        setEditValue('');
      } else if (key.escape) {
        setIsEditMode(false);
        setEditField('');
        setEditValue('');
      } else if (key.backspace || key.delete) {
        setEditValue(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setEditValue(prev => prev + input);
      }
      return;
    }

    if (input === '/' || input === 's') {
      setIsSearchMode(true);
      return;
    }

    // Handle scrolling first (before navigation)
    if (key.upArrow && key.ctrl) {
      // Scroll CRUD pane up (Ctrl+Up)
      setCrudScrollOffset(prev => Math.max(0, prev - 3));
      return;
    } else if (key.downArrow && key.ctrl) {
      // Scroll CRUD pane down (Ctrl+Down)
      setCrudScrollOffset(prev => Math.max(0, prev + 3));
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      setSelectedIndex(newIndex);
      // Auto-scroll tree pane if needed within current context
      const contextNode = selectedParent || treeRoot;
      const contextIndex = flatNodes.findIndex(item => item.node === contextNode);
      const relativeIndex = newIndex - contextIndex - 1; // -1 because context node is at contextIndex
      if (relativeIndex < treeScrollOffset) {
        setTreeScrollOffset(Math.max(0, relativeIndex));
      }
    } else if (key.downArrow) {
      const newIndex = Math.min(flatNodes.length - 1, selectedIndex + 1);
      setSelectedIndex(newIndex);
      // Auto-scroll tree pane if needed within current context
      const contextNode = selectedParent || treeRoot;
      const contextIndex = flatNodes.findIndex(item => item.node === contextNode);
      const relativeIndex = newIndex - contextIndex - 1; // -1 because context node is at contextIndex
      const maxVisible = MAX_VISIBLE_TREE_ITEMS;
      if (relativeIndex >= treeScrollOffset + maxVisible) {
        setTreeScrollOffset(relativeIndex - maxVisible + 1);
      }
    } else if (key.leftArrow) {
      // Collapse current node
      if (selectedNode && expandedNodes.has(selectedNode.id)) {
        setExpandedNodes(prev => {
          const next = new Set(prev);
          next.delete(selectedNode.id);
          return next;
        });
      }
    } else if (key.rightArrow) {
      // Expand current node
      if (selectedNode && selectedNode.children.length > 0) {
        setExpandedNodes(prev => new Set([...prev, selectedNode.id]));
      }
    } else if (key.return || input === ' ') {
      // Toggle expansion or perform action
      if (!selectedNode) return;

      // Handle ModelNode selection
      if (selectedNode instanceof ModelNode) {
        const modelsNode = selectedParent as ModelsNode;
        if (modelsNode && modelsNode instanceof ModelsNode) {
          const result = crud.updateNode(modelsNode.id, { selectedModel: selectedNode.model.name });

          if (result.success) {
            // Set as active model in wren config FIRST
            config.setModel(selectedNode.model.name);
            console.log(`[ProviderTreeUI] Model changed to: ${selectedNode.model.name}`);
            console.log(`[ProviderTreeUI] Verified config.getModel(): ${config.getModel()}`);
            // Notify parent component of model change
            onModelChange?.(selectedNode.model.name);
            // Save tree state
            saveTreeToDisk();
            // Show success message with model name
            setStatusMessage(`✅ Active model changed to: ${selectedNode.model.name} | Press Esc to exit`);
          } else {
            setStatusMessage(`❌ Failed to select model: ${result.message}`);
          }
          setTimeout(() => setStatusMessage(''), 5000); // Longer display time
        }
        return;
      }

      // Always try to expand/collapse if the node has children
      if (selectedNode.children.length > 0) {
        setExpandedNodes(prev => {
          const next = new Set(prev);
          if (next.has(selectedNode.id)) {
            next.delete(selectedNode.id);
            setStatusMessage(`▲ Collapsed: ${selectedNode.label}`);
          } else {
            next.add(selectedNode.id);
            setStatusMessage(`▼ Expanded: ${selectedNode.label} (${selectedNode.children.length} children)`);
          }
          setTimeout(() => setStatusMessage(''), 1500);
          return next;
        });
      } else {
        // Leaf node - show info
        setStatusMessage(`ℹ️ ${selectedNode.label} (${selectedNode.type}, no children)`);
        setTimeout(() => setStatusMessage(''), 1500);
      }
    } else if (key.escape) {
      onClose?.();
    } else if (input === 't') {
      // Toggle enable
      if (selectedNode instanceof ProviderNode) {
        const result = crud.updateNode(selectedNode.id, { enabled: !selectedNode.enabled });
        setStatusMessage(result.message);
        if (result.success) saveTreeToDisk();
      }
    } else if (input === 'd') {
      // Delete provider
      if (selectedNode instanceof ProviderNode) {
        const result = crud.deleteProvider(selectedNode.provider);
        setStatusMessage(result.message);
        if (result.success) {
          saveTreeToDisk();
          setSelectedIndex(0);
        }
      }
    } else if (input === 'r') {
      setStatusMessage('🔄 Rescanning models...');
      scheduleRescan();
    } else if (input === 'i') {
      // Force immediate initialization
      setStatusMessage('🔄 Force initializing...');
      treeRoot.initialize().then(() => {
        const modelCount = Array.from(treeRoot.providers.values())
          .reduce((sum, p) => {
            const modelsNode = p.children.find(c => c.type === 'models') as ModelsNode;
            return sum + (modelsNode?.children.length || 0);
          }, 0);
        setStatusMessage(`✅ Initialized: ${treeRoot.providers.size} providers, ${modelCount} models`);
        setTimeout(() => setStatusMessage(''), 3000);
      }).catch(e => {
        setStatusMessage(`❌ Init error: ${e}`);
      });
    } else if (input === 'R') {
      // Reset metrics
      if (selectedNode instanceof MetricsNode) {
        const result = crud.updateNode(selectedNode.id, { reset: true });
        setStatusMessage(result.message);
        if (result.success) saveTreeToDisk();
      }
    } else if (input === 'S') {
      saveTreeToDisk();
    } else if (input === 'L') {
      loadTreeFromDisk();
    } else if (input === 'e') {
      // Edit mode - depends on node type
      if (!selectedNode) return;

      if (selectedNode instanceof ProviderNode) {
        setEditField('baseUrl');
        setEditValue(selectedNode.baseUrl ?? '');
        setIsEditMode(true);
      } else if (selectedNode instanceof UsageNode) {
        setEditField('dailyTokenLimit');
        setEditValue(String(selectedNode.dailyTokenLimit ?? ''));
        setIsEditMode(true);
      }
    } else if (input === 'E') {
      // Export graph
      const result = crud.exportGraph();
      if (result.success) {
        setStatusMessage(`📤 Exported: ${JSON.stringify(result.data).substring(0, 50)}...`);
      } else {
        setStatusMessage(result.message);
      }
    } else if (input === 'j') {
      // Open JSON editor
      if (selectedNode) {
        const result = crud.readNode(selectedNode.id);
        if (result.success) {
          setIsJsonEditorOpen(true);
          setJsonEditorNodeId(selectedNode.id);
          setJsonEditorContent(JSON.stringify(result.data, null, 2));
        } else {
          setStatusMessage(result.message);
        }
      }
    } else if (input === '1' || input === '2') {
      // Toggle model format flags
      if (selectedNode instanceof ModelNode) {
        const flagMap: Record<string, string> = {
          '1': 'gptOssFormat',
          '2': 'geminiNative'
        };
        const flagName = flagMap[input];
        const currentValue = (selectedNode as any)[flagName];
        const newValue = currentValue === undefined ? true : currentValue === true ? false : undefined;

        const result = crud.updateNode(selectedNode.id, { [flagName]: newValue });
        setStatusMessage(result.message);
        if (result.success) saveTreeToDisk();
      }
    }
  });

  // Render tree node
  const renderNode = (item: {node: TreeNode, depth: number, parent?: TreeNode}, index: number) => {
    const { node, depth, parent } = item;
    const isSelected = index === selectedIndex;
    const isExpanded = expandedNodes.has(node.id);
    const indent = '  '.repeat(Math.max(0, depth));

    let icon = '';
    let color = Colors.Gray;

    switch (node.type) {
      case 'root':
        icon = '🌳';
        color = Colors.AccentBlue;
        break;
      case 'provider':
        icon = node.children.length > 0 && isExpanded ? '📂' : '📁';
        color = Colors.AccentCyan;
        break;
      case 'config':
        icon = '⚙️';
        color = Colors.AccentYellow;
        break;
      case 'models':
        icon = '🤖';
        color = Colors.AccentGreen;
        break;
      case 'quota':
        icon = '📊';
        color = Colors.AccentPurple;
        break;
      case 'metrics':
        icon = '📈';
        color = Colors.AccentRed;
        break;
      default:
        icon = '📄';
        color = Colors.Gray;
    }

    const expandIcon = node.children.length > 0
      ? (isExpanded ? '▼ ' : '▶ ')
      : '  ';

    const cursor = isSelected ? '> ' : '  ';

    // Check if this is a selected model
    let selectionMarker = '';
    let rankingBadge = '';
    if (node instanceof ModelNode && parent instanceof ModelsNode) {
      if (parent.selectedModel === node.model.name) {
        selectionMarker = ' ⭐';
        color = Colors.AccentGreen;
      }
      // Add ranking badge if model has been used
      if (node.totalRequests > 0) {
        rankingBadge = ` [${node.rankingGrade}]`;
      }
    }

    return (
      <Box key={node.id}>
        <Text color={isSelected ? Colors.AccentCyan : color}>
          {cursor}{indent}{expandIcon}{icon} {node.label}{rankingBadge}{selectionMarker}
        </Text>
      </Box>
    );
  };

  // Render node-specific CRUD panel with scrolling
  const renderCRUDPanel = () => {
    if (!selectedNode) {
      return <Text color={Colors.Gray}>No node selected</Text>;
    }

    const jsonData = selectedNode.toJSON();
    const crudLines: string[] = [];

    if (selectedNode instanceof ProviderNode) {
      crudLines.push(selectedNode.label); // Title
      crudLines.push('Type: Provider');
      crudLines.push(`Provider ID: ${selectedNode.provider}`);
      crudLines.push(`Enabled: ${selectedNode.enabled ? 'Yes' : 'No'}`);
      crudLines.push(`API Key (${selectedNode.envVar}): ${selectedNode.hasApiKey ? '✅ Set' : '❌ Missing'}`);
      crudLines.push(`Base URL: ${selectedNode.baseUrl ?? '<not set>'}`);
      crudLines.push(`Bayes Weight: ${selectedNode.bayesWeight}`);
      crudLines.push(''); // Empty line
      crudLines.push('Actions:');
      crudLines.push('• (t) Toggle enable/disable');
      crudLines.push('• (e) Edit base URL');
      crudLines.push('• (d) Delete provider');
      crudLines.push('• (j) View as JSON');

      if (isEditMode) {
        crudLines.push(''); // Empty line
        crudLines.push(`Editing ${editField}: ${editValue}`);
      }
    } else if (selectedNode instanceof UsageNode) {
      crudLines.push('Usage & Limits'); // Title
      crudLines.push(`Daily Limit: ${selectedNode.dailyTokenLimit ?? 'Not set'}`);
      crudLines.push(`Daily Used: ${selectedNode.dailyTokensUsed}`);
      crudLines.push(`Monthly Limit: ${selectedNode.monthlyTokenLimit ?? 'Not set'}`);
      crudLines.push(`Monthly Used: ${selectedNode.monthlyTokensUsed}`);
      crudLines.push(`Usage: ${selectedNode.quotaUsagePercent.toFixed(1)}%`);
      crudLines.push(`Est. Daily Cost: $${selectedNode.estimatedDailyCost.toFixed(2)}`);
      crudLines.push(''); // Empty line
      crudLines.push('• (e) Edit usage limits');
      crudLines.push('• (j) View as JSON');
    } else if (selectedNode instanceof QuotaNode) {
      crudLines.push('Quota Container'); // Title
      crudLines.push(`Name: ${selectedNode.quotaName}`);
      crudLines.push(`Providers: ${selectedNode.providers.size}`);
      crudLines.push(''); // Empty line
      crudLines.push('• (j) View as JSON');
    } else if (selectedNode instanceof MetricsNode) {
      crudLines.push('Performance Metrics'); // Title
      crudLines.push(`Total Requests: ${selectedNode.totalRequests}`);
      crudLines.push(`Success: ${selectedNode.successCount}`);
      crudLines.push(`Errors: ${selectedNode.errorCount}`);
      crudLines.push(`Success Rate: ${selectedNode.successRate.toFixed(1)}%`);
      crudLines.push(`Avg Latency: ${selectedNode.avgLatencyMs.toFixed(0)}ms`);
      crudLines.push(''); // Empty line
      crudLines.push('Bayesian Ranking:');
      crudLines.push(`  Grade: ${selectedNode.rankingGrade}`);
      crudLines.push(`  Score: ${(selectedNode.bayesianScore * 100).toFixed(1)}%`);
      if (selectedNode.lastError) {
        crudLines.push(''); // Empty line
        crudLines.push(`Last Error: ${selectedNode.lastError}`);
      }
      crudLines.push(''); // Empty line
      crudLines.push('• (R) Reset metrics');
      crudLines.push('• (j) View as JSON');
    } else if (selectedNode instanceof ConfigNode) {
      crudLines.push('Configuration'); // Title
      crudLines.push(`Base URL: ${selectedNode.parent.baseUrl ?? 'Not set'}`);
      crudLines.push(`Enabled: ${selectedNode.parent.enabled ? 'Yes' : 'No'}`);
      crudLines.push(`Bayes Weight: ${selectedNode.parent.bayesWeight}`);
      crudLines.push(`Env Var: ${selectedNode.parent.envVar}`);
      crudLines.push(''); // Empty line
      crudLines.push('• (j) View as JSON');
    } else if (selectedNode instanceof ModelsNode) {
      crudLines.push(`Models (${selectedNode.children.length})`); // Title
      crudLines.push(`Selected: ${selectedNode.selectedModel ?? 'None'}`);
      crudLines.push(''); // Empty line
      crudLines.push('• Expand to see individual models');
      crudLines.push('• (j) View as JSON');
    } else if (selectedNode instanceof ModelNode) {
      const formatFlag = (val: boolean | undefined) =>
        val === true ? '✅ true' : val === false ? '❌ false' : '⚪ None';

      // Check if this model is currently selected in its parent ModelsNode
      const modelsNode = selectedParent as ModelsNode;
      const isSelected = modelsNode?.selectedModel === selectedNode.model.name;

      crudLines.push(selectedNode.label + (isSelected ? ' ⭐ SELECTED' : '')); // Title
      crudLines.push(`Model: ${selectedNode.model.name}`);
      crudLines.push(`Token Limit: ${selectedNode.model.tokenLimit.toLocaleString()}`);
      crudLines.push(''); // Empty line

      // Show ranking if the model has been used
      if (selectedNode.totalRequests > 0) {
        crudLines.push('Performance Ranking:');
        crudLines.push(`  Grade: ${selectedNode.rankingGrade}`);
        crudLines.push(`  Bayesian Score: ${(selectedNode.bayesianScore * 100).toFixed(1)}%`);
        crudLines.push(`  Requests: ${selectedNode.totalRequests} (${selectedNode.successCount} success, ${selectedNode.errorCount} errors)`);
        crudLines.push(`  Success Rate: ${selectedNode.successRate.toFixed(1)}%`);
        crudLines.push(`  Avg Latency: ${selectedNode.avgLatencyMs.toFixed(0)}ms`);
        crudLines.push(''); // Empty line
      }

      crudLines.push('API Format Flags:');
      crudLines.push(`  GPT-OSS:     ${formatFlag(selectedNode.gptOssFormat)}`);
      crudLines.push(`  Gemini Native: ${formatFlag(selectedNode.geminiNative)}`);
      crudLines.push(''); // Empty line
      crudLines.push('Actions:');
      crudLines.push('• (Enter/Space) Select this model');
      crudLines.push('• (1) Toggle GPT-OSS format');
      crudLines.push('• (2) Toggle Gemini native format');
      crudLines.push('• (j) View as JSON');
    } else {
      // Generic node display
      crudLines.push(selectedNode.label); // Title
      crudLines.push(`Type: ${selectedNode.type}`);
      crudLines.push(`ID: ${selectedNode.id}`);
      crudLines.push(`Children: ${selectedNode.children.length}`);
      crudLines.push(''); // Empty line
      crudLines.push('JSON Preview:');
      crudLines.push(JSON.stringify(jsonData, null, 2).substring(0, 300));
    }

    // Apply scrolling to the lines
    const visibleLines = crudLines.slice(crudScrollOffset, crudScrollOffset + MAX_VISIBLE_CRUD_LINES);

    return (
      <Box flexDirection="column">
        {crudScrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}
        {visibleLines.map((line, index) => {
          if (line === '') {
            return <Box key={index} height={1} />;
          }
          // Check if this is a title line (first line or after empty line)
          const isTitle = index === 0 || (index > 0 && crudLines[crudScrollOffset + index - 1] === '');
          return (
            <Text key={index} color={isTitle ? Colors.AccentCyan : Colors.Gray} bold={isTitle}>
              {line}
            </Text>
          );
        })}
        {crudScrollOffset + MAX_VISIBLE_CRUD_LINES < crudLines.length && <Text color={Colors.Foreground}>▼</Text>}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} padding={1}>
      <Text bold color={Colors.AccentBlue}>
        🌲 /auth - Provider Tree CRUD (JSON Facade)
      </Text>
      <Text color={Colors.Gray}>
        {isJsonEditorOpen
          ? 'JSON Editor: Ctrl+Enter Save | Esc Cancel'
          : '↑↓←→ Navigate | Enter/Space Select/Toggle | / Search | Ctrl+↑↓ Scroll | i Init | r Rescan | Esc Exit'}
      </Text>

      {isSearchMode && (
        <Box marginTop={1} borderStyle="single" borderColor={Colors.AccentCyan} padding={1}>
          <Text color={Colors.AccentCyan}>🔍 Search: {searchQuery}</Text>
          <Text color={Colors.Gray}>Type to search, Enter to confirm, Esc to cancel</Text>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentCyan}>{statusMessage}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="row" gap={2}>
        {/* LEFT PANE: JSON Editor OR Tree Navigation */}
        {isJsonEditorOpen ? (
          <Box flexDirection="column" width="50%" borderStyle="single" borderColor={Colors.AccentCyan} padding={1}>
            <Box flexDirection="column">
              {jsonEditorContent.split('\n').map((line, idx) => (
                <Text key={idx} color={Colors.Foreground}>{line}</Text>
              ))}
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" width="50%" borderStyle="single" borderColor={Colors.Gray} padding={1}>
            <Text bold color={Colors.AccentYellow}>Tree Navigation</Text>
            <Box marginTop={1} flexDirection="column">
              {/* Show root node always */}
              {(() => {
                const rootItem = flatNodes[0];
                if (rootItem) {
                  return renderNode({node: rootItem.node, depth: rootItem.depth, parent: rootItem.parent}, 0);
                }
                return null;
              })()}

              {/* Show parent context if we have one */}
              {selectedParent && selectedIndex > 0 && (
                <Box marginTop={1} borderStyle="single" borderColor={Colors.Gray} paddingX={1}>
                  <Text color={Colors.AccentCyan} bold>
                    📁 {selectedParent.label}
                  </Text>
                </Box>
              )}

              {/* Scrollable children area */}
              <Box marginTop={1} flexDirection="column">
                {(() => {
                  // Find children of the current context (selected parent or root)
                  const contextNode = selectedParent || treeRoot;
                  const contextIndex = flatNodes.findIndex(item => item.node === contextNode);
                  const childrenStartIndex = contextIndex + 1;

                  // Find all direct children of the context node
                  const childItems: Array<{item: {node: TreeNode, depth: number, parent?: TreeNode}, originalIndex: number}> = [];
                  for (let i = childrenStartIndex; i < flatNodes.length; i++) {
                    const item = flatNodes[i];
                    if (item.parent === contextNode) {
                      childItems.push({item, originalIndex: i});
                    } else if (item.depth <= (contextNode === treeRoot ? 0 : flatNodes[contextIndex]?.depth || 0)) {
                      // Stop when we reach a sibling or ancestor
                      break;
                    }
                  }

                  // Apply scrolling to children
                  const visibleChildren = childItems.slice(treeScrollOffset, treeScrollOffset + MAX_VISIBLE_TREE_ITEMS);

                  return (
                    <>
                      {treeScrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}
                      {visibleChildren.map(({item, originalIndex}) =>
                        renderNode({node: item.node, depth: item.depth, parent: item.parent}, originalIndex)
                      )}
                      {treeScrollOffset + MAX_VISIBLE_TREE_ITEMS < childItems.length && <Text color={Colors.Foreground}>▼</Text>}
                    </>
                  );
                })()}
              </Box>
            </Box>
          </Box>
        )}

        {/* RIGHT PANE: Node-Specific CRUD */}
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor={Colors.AccentYellow} padding={1}>
          <Text bold color={Colors.AccentYellow}>Node Operations (CRUD)</Text>
          <Box marginTop={1} flexDirection="column">
            {renderCRUDPanel()}
          </Box>
        </Box>
      </Box>

      {/* Bottom: Tree Stats */}
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={Colors.AccentGreen} padding={1}>
        <Text bold color={Colors.AccentGreen}>Graph Statistics</Text>
        <Text color={Colors.Gray}>
          Nodes: {flatNodes.length} |
          Active Providers: {treeRoot.getActiveProviders().length}/{treeRoot.providers.size} |
          {(() => {
            const metrics = treeRoot.getTotalMetrics();
            if (metrics.totalRequests === 0) return 'No usage yet';
            return `${metrics.totalRequests} req, ${metrics.avgSuccessRate.toFixed(1)}% success, ${metrics.avgLatency.toFixed(0)}ms avg`;
          })()}
        </Text>
      </Box>
    </Box>
  );
}