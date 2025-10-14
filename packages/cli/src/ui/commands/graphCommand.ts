/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';
import { GraphService, GraphNode, GraphEdge, GraphNodeType } from '@wren-coder/wren-coder-cli-core';

// Simple argument parsing helper: keeps order simple and predictable.
function splitArgs(args: string): string[] {
  return args.trim().length === 0 ? [] : args.trim().split(/\s+/);
}

export const graphCommand: SlashCommand = {
  name: 'graph',
  description: 'Manage the JSON graph of providers/models/configs/metrics. Subcommands: list-nodes, add-node, update-node, delete-node, list-edges, add-edge, delete-edge',
  action: async (context, args) => {
    const cfg = context.services.config;
    if (!cfg) return { type: 'message', messageType: 'error', content: 'Configuration not available' };

    const graphService = new GraphService(cfg);

    const parts = splitArgs(args);
    const cmd = parts[0];

    try {
      if (!cmd || cmd === 'list-nodes') {
        const type = parts[1] as GraphNodeType | undefined;
        const nodes = type ? await graphService.findNodesByType(type) : (await graphService.getGraph()).nodes;
        return { type: 'message', messageType: 'info', content: JSON.stringify(nodes, null, 2) };
      }

      if (cmd === 'add-node') {
        // usage: /graph add-node <id> <type> <label> [json-metadata]
        const [,, id, typeStr, label, metadataRaw] = ['dummy'].concat(parts);
        if (!id || !typeStr || !label) return { type: 'message', messageType: 'error', content: 'Usage: /graph add-node <id> <type> <label> [json-metadata]' };
        const type = typeStr as GraphNodeType;
        const metadata = metadataRaw ? JSON.parse(metadataRaw) : undefined;
        const node: GraphNode = { id, type, label, metadata };
        await graphService.addNode(node);
        return { type: 'message', messageType: 'info', content: `Node ${id} added` };
      }

      if (cmd === 'update-node') {
        // usage: /graph update-node <id> <json-updates>
        const id = parts[1];
        const updatesRaw = parts.slice(2).join(' ');
        if (!id || !updatesRaw) return { type: 'message', messageType: 'error', content: 'Usage: /graph update-node <id> <json-updates>' };
        const updates = JSON.parse(updatesRaw);
        const ok = await graphService.updateNode(id, updates);
        return { type: 'message', messageType: 'info', content: ok ? `Node ${id} updated` : `Node ${id} not found` };
      }

      if (cmd === 'delete-node') {
        // usage: /graph delete-node <id>
        const id = parts[1];
        if (!id) return { type: 'message', messageType: 'error', content: 'Usage: /graph delete-node <id>' };
        const ok = await graphService.deleteNode(id);
        return { type: 'message', messageType: 'info', content: ok ? `Node ${id} deleted` : `Node ${id} not found` };
      }

      if (cmd === 'list-edges') {
        const edges = (await graphService.getGraph()).edges;
        return { type: 'message', messageType: 'info', content: JSON.stringify(edges, null, 2) };
      }

      if (cmd === 'add-edge') {
        // usage: /graph add-edge <id> <from> <to> [label] [json-metadata]
        const [,, id, from, to, label, metadataRaw] = ['dummy'].concat(parts);
        if (!id || !from || !to) return { type: 'message', messageType: 'error', content: 'Usage: /graph add-edge <id> <from> <to> [label] [json-metadata]' };
        const metadata = metadataRaw ? JSON.parse(metadataRaw) : undefined;
        const edge: GraphEdge = { id, from, to, label, metadata };
        await graphService.addEdge(edge);
        return { type: 'message', messageType: 'info', content: `Edge ${id} added` };
      }

      if (cmd === 'delete-edge') {
        const id = parts[1];
        if (!id) return { type: 'message', messageType: 'error', content: 'Usage: /graph delete-edge <id>' };
        const ok = await graphService.deleteEdge(id);
        return { type: 'message', messageType: 'info', content: ok ? `Edge ${id} deleted` : `Edge ${id} not found` };
      }

      return { type: 'message', messageType: 'error', content: `Unknown graph subcommand: ${cmd}` };

    } catch (e) {
      return { type: 'message', messageType: 'error', content: `Graph operation failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};


