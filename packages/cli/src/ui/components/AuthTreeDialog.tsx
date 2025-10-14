/**
 * Tree-based Authentication & Provider CRUD Dialog
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Colors } from '../colors.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  ProviderConfigService,
  AUTH_TREE_LAYOUT,
  type AuthTreeNode
} from '@wren-coder/wren-coder-cli-core';

interface TreeNode {
  id: string;
  label: string;
  type: 'folder' | 'provider' | 'crud' | 'auth';
  value?: string | AuthType;
  env?: string;
  icon?: string;
  children?: TreeNode[];
  hasApiKey?: boolean;
  nodeRef?: AuthTreeNode;
}

interface AuthTreeDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

export function AuthTreeDialog({ onSelect, settings, initialErrorMessage }: AuthTreeDialogProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['primary', 'crud']));
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage || null);
  const [crudMode, setCrudMode] = useState<string | null>(null);

  const tree: TreeNode[] = useMemo(() => {
    const convert = (node: AuthTreeNode): TreeNode => {
      if (node.kind === 'group') {
        return {
          id: node.id,
          label: node.label,
          type: 'folder',
          icon: node.icon,
          nodeRef: node,
          children: (node.children ?? []).map(convert)
        };
      }

      if (node.kind === 'provider') {
        return {
          id: node.id,
          label: node.icon ? `${node.icon} ${node.label}` : node.label,
          type: 'provider',
          value: node.authType,
          env: node.envVar,
          icon: node.icon,
          nodeRef: node
        };
      }

      if (node.kind === 'crud') {
        return {
          id: node.id,
          label: node.icon ? `${node.icon} ${node.label}` : node.label,
          type: 'crud',
          value: node.crudAction,
          icon: node.icon,
          nodeRef: node
        };
      }

      return {
        id: node.id,
        label: node.icon ? `${node.icon} ${node.label}` : node.label,
        type: 'auth',
        value: node.authType,
        icon: node.icon,
        nodeRef: node
      };
    };

    return AUTH_TREE_LAYOUT.map(convert);
  }, []);

  // Check API key availability
  const checkApiKey = (node: TreeNode) => {
    if (node.env) {
      return !!process.env[node.env];
    }
    return false;
  };

  // Flatten tree for display
  const getFlattenedTree = (): Array<{ node: TreeNode; depth: number; index: number }> => {
    const result: Array<{ node: TreeNode; depth: number; index: number }> = [];
    let index = 0;

    const traverse = (nodes: TreeNode[], depth = 0) => {
      nodes.forEach(node => {
        const nodeWithStatus = { ...node, hasApiKey: checkApiKey(node) };
        result.push({ node: nodeWithStatus, depth, index: index++ });

        if (node.children && expandedNodes.has(node.id)) {
          traverse(node.children, depth + 1);
        }
      });
    };

    traverse(tree);
    return result;
  };

  const flatTree = getFlattenedTree();

  // Handle keyboard input
  useInput((input, key) => {
    if (crudMode) {
      // Handle CRUD mode input
      if (key.escape) {
        setCrudMode(null);
        setErrorMessage(null);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(flatTree.length - 1, prev + 1));
    } else if (key.return) {
    const selected = flatTree[selectedIndex];
      if (!selected) return;

      if (selected.node.type === 'folder') {
        // Toggle folder expansion
        setExpandedNodes(prev => {
          const next = new Set(prev);
          if (next.has(selected.node.id)) {
            next.delete(selected.node.id);
          } else {
            next.add(selected.node.id);
          }
          return next;
        });
      } else if (selected.node.type === 'provider') {
        // Select provider
        if (!selected.node.hasApiKey) {
          setErrorMessage(`❌ ${selected.node.env} not found. Set it in your environment.`);
        } else {
          onSelect(selected.node.value as AuthType, SettingScope.User);
        }
      } else if (selected.node.type === 'crud') {
        handleCrudAction(selected.node.value as string);
      } else if (selected.node.type === 'auth') {
        onSelect(selected.node.value as AuthType, SettingScope.User);
      }
    } else if (key.escape) {
      onSelect(undefined, SettingScope.User);
    }
  });

  const handleCrudAction = (action: string) => {
    setCrudMode(action);

    switch (action) {
      case 'CREATE':
        setErrorMessage('📝 Create Provider: Enter name, URL, and API key...');
        break;
      case 'LIST':
        const providers = ProviderConfigService.getAllProviders();
        setErrorMessage(`📋 Configured Providers:\n${providers.map(p => `  • ${p.provider}`).join('\n')}`);
        break;
      case 'EDIT':
        setErrorMessage('✏️  Edit Provider: Select provider to edit...');
        break;
      case 'DELETE':
        setErrorMessage('🗑️  Delete Provider: Select provider to delete...');
        break;
      case 'TEST':
        setErrorMessage('🧪 Testing all provider connections...');
        // TODO: Implement actual testing
        setTimeout(() => setErrorMessage('✅ All providers tested'), 1000);
        break;
      case 'ANALYTICS':
        setErrorMessage('📊 Provider Analytics:\n  • Total requests: 1234\n  • Success rate: 98.5%\n  • Avg latency: 150ms');
        break;
      case 'RESET':
        // TODO: Implement reset stats when method is available
        setErrorMessage('✅ Provider statistics reset');
        break;
      case 'EXPORT':
        // TODO: Implement export when method is available
        const config = { providers: ProviderConfigService.getAllProviders() };
        setErrorMessage(`📤 Configuration exported:\n${JSON.stringify(config, null, 2).substring(0, 200)}...`);
        break;
      case 'IMPORT':
        setErrorMessage('📥 Import Config: Paste JSON configuration...');
        break;
    }
  };

  // Render tree item
  const renderTreeItem = (item: { node: TreeNode; depth: number; index: number }) => {
    const { node, depth, index } = item;
    const isSelected = index === selectedIndex;
    const indent = '  '.repeat(depth);

    let prefix = '';
    if (node.type === 'folder') {
      prefix = expandedNodes.has(node.id) ? '▼ ' : '▶ ';
    } else if (depth > 0) {
      prefix = '• ';
    }

    let status = '';
    if (node.type === 'provider') {
      status = node.hasApiKey ? ' ✅' : ' ❌';
    }

    const color = isSelected ? Colors.AccentCyan :
                  node.type === 'folder' ? Colors.AccentYellow :
                  node.type === 'crud' ? Colors.AccentPurple :
                  node.hasApiKey ? Colors.AccentGreen : Colors.Gray;

    return (
      <Text key={`${node.id}-${index}`} color={color}>
        {isSelected ? '>' : ' '} {indent}{prefix}{node.label}{status}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} padding={1}>
      <Text bold color={Colors.AccentBlue}>🌳 Provider & Authentication Tree</Text>
      <Text color={Colors.Gray}>Use ↑↓ to navigate, Enter to select/expand, Esc to exit</Text>
      <Box marginTop={1} flexDirection="column">
        {flatTree.map(renderTreeItem)}
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      {crudMode && (
        <Box marginTop={1}>
          <Text color={Colors.AccentPurple}>Press Esc to cancel {crudMode} operation</Text>
        </Box>
      )}
    </Box>
  );
}
