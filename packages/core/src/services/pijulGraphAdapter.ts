/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PijulService } from './pijulService.js';

/**
 * PijulGraphAdapter - Maps Pijul patches to graph nodes
 *
 * Use Case (per user proposal):
 * "Shadow things with Pijul for graph nodes"
 *
 * Architecture:
 * - Wren's provider tree = mutable graph (JSON)
 * - Pijul shadow repo = immutable patch DAG
 * - Each tree modification = Pijul patch = graph node
 * - Patch dependencies = graph edges
 * - Commutative patches = parallel agent edits
 *
 * IPFS Integration Potential:
 * - Pijul patch hash = content-addressed (like IPFS CID)
 * - Can publish patches to IPFS for trustless sync
 * - IPFS-Git gateway translates patches → commits
 * - Benefit: Decentralized audit trail of config changes
 *
 * Example:
 * ```
 * Agent 1: Add OpenAI model → Patch A (node A in graph)
 * Agent 2: Add NVIDIA model → Patch B (node B in graph)
 * Agent 3: Update quota → Patch C depends on A,B (node C with edges to A,B)
 * ```
 *
 * Graph Properties:
 * - Nodes: Pijul patches (content-addressed, immutable)
 * - Edges: Patch dependencies (explicit references)
 * - Merge: Automatic for commutative patches (no conflict)
 * - Query: "What config was active at patch X?"
 * - Rollback: "Undo patch Y without losing Z"
 */

export interface GraphNode {
  id: string; // Pijul patch hash
  message: string; // Semantic description
  timestamp: Date;
  author: string;
  dependencies: string[]; // Parent patch hashes
  content?: string; // Optional: patch content for inspection
}

export class PijulGraphAdapter {
  private pijulService: PijulService;

  constructor(projectRoot: string) {
    this.pijulService = new PijulService(projectRoot);
  }

  async initialize(): Promise<void> {
    await this.pijulService.initialize();
  }

  /**
   * Create a graph node from a Pijul patch
   * Each config change = new node in the graph
   *
   * @param message - Semantic description (e.g., "Add OpenAI GPT-4 model")
   * @returns Node ID (patch hash)
   */
  async createNode(message: string): Promise<string> {
    const patchHash = await this.pijulService.createFileSnapshot(message);
    return patchHash; // Pijul patch hash = graph node ID
  }

  /**
   * Get graph node metadata
   * Translates Pijul patch info → graph node structure
   */
  async getNode(nodeId: string): Promise<GraphNode> {
    const patchInfo = await this.pijulService.getPatchInfo(nodeId);

    // Parse Pijul log output (format varies by version)
    // Example output:
    // Hash: ABCD1234...
    // Author: Wren Coder CLI <wren@wren-coder.dev>
    // Date: 2025-10-08 12:34:56
    // Message: Add OpenAI GPT-4 model
    // Dependencies: XYZ9876...

    const hashMatch = patchInfo.match(/Hash:\s*([A-Z0-9]{52})/);
    const authorMatch = patchInfo.match(/Author:\s*(.+)/);
    const dateMatch = patchInfo.match(/Date:\s*(.+)/);
    const messageMatch = patchInfo.match(/Message:\s*(.+)/);
    const depsMatch = patchInfo.match(/Dependencies:\s*(.+)/);

    return {
      id: hashMatch?.[1] || nodeId,
      message: messageMatch?.[1] || 'Unknown',
      timestamp: dateMatch?.[1] ? new Date(dateMatch[1]) : new Date(),
      author: authorMatch?.[1] || 'Unknown',
      dependencies: depsMatch?.[1]?.split(',').map(d => d.trim()).filter(Boolean) || [],
      content: patchInfo,
    };
  }

  /**
   * Get graph structure (DAG of patches)
   * Returns all nodes with their edges (dependencies)
   *
   * @param limit - Maximum nodes to fetch (default: 100)
   */
  async getGraph(limit: number = 100): Promise<GraphNode[]> {
    const patchHashes = await this.pijulService.listPatches(limit);
    const nodes: GraphNode[] = [];

    for (const hash of patchHashes) {
      try {
        const node = await this.getNode(hash);
        nodes.push(node);
      } catch {
        // Skip patches that can't be parsed
        continue;
      }
    }

    return nodes;
  }

  /**
   * Restore graph to specific node state
   * Rolls back to patch X without losing subsequent patches
   *
   * Use case: "Config broken at patch Y, revert to X, re-apply Z"
   */
  async restoreToNode(nodeId: string): Promise<void> {
    await this.pijulService.restoreProjectFromSnapshot(nodeId);
  }

  /**
   * Get current graph head (latest patch)
   * Equivalent to: "What's the current config state?"
   */
  async getCurrentNode(): Promise<string> {
    return await this.pijulService.getCurrentPatchHash();
  }

  /**
   * Check if two nodes are independent (commutative)
   * Uses Pijul's patch theory: patches either depend or commute
   *
   * @returns true if patches can be applied in any order
   */
  async areNodesIndependent(nodeA: string, nodeB: string): Promise<boolean> {
    const nodeAData = await this.getNode(nodeA);
    const nodeBData = await this.getNode(nodeB);

    // Check if either depends on the other
    const aToB = nodeAData.dependencies.includes(nodeB);
    const bToA = nodeBData.dependencies.includes(nodeA);

    // Independent if neither depends on the other
    return !aToB && !bToA;
  }

  /**
   * IPFS integration hook (future)
   * Publish patches to IPFS for decentralized storage
   *
   * Benefits:
   * - Content-addressed audit trail
   * - Trustless sync between instances
   * - Immutable config history
   *
   * Implementation:
   * - ipfs.add(patchContent) → CID
   * - Store mapping: patchHash → IPFS CID
   * - Fetch remote patches: ipfs.cat(CID)
   */
  async publishToIPFS(_nodeId: string): Promise<string> {
    // Placeholder for IPFS integration
    // Would require: ipfs-http-client or similar
    throw new Error('IPFS integration not yet implemented');
  }
}
