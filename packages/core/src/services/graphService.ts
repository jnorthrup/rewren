/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config/config.js';

export type GraphNodeType = 'provider' | 'model' | 'config' | 'metric' | 'other';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface JsonGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt?: string;
}

export class GraphService {
  private readonly graphFile = '.wren/graph.json';

  constructor(private config: Config) {}

  private getGraphPath(): string {
    return path.join(this.config.getWorkingDir(), this.graphFile);
  }

  async loadGraph(): Promise<JsonGraph> {
    const p = this.getGraphPath();
    try {
      const raw = await fs.promises.readFile(p, 'utf-8');
      const parsed = JSON.parse(raw) as JsonGraph;
      return parsed;
    } catch (e) {
      return { nodes: [], edges: [], updatedAt: new Date().toISOString() };
    }
  }

  async saveGraph(graph: JsonGraph): Promise<void> {
    const p = this.getGraphPath();
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    graph.updatedAt = new Date().toISOString();
    await fs.promises.writeFile(p, JSON.stringify(graph, null, 2), 'utf-8');
  }

  async getGraph(): Promise<JsonGraph> {
    return this.loadGraph();
  }

  async addNode(node: GraphNode): Promise<void> {
    const graph = await this.loadGraph();
    if (graph.nodes.find(n => n.id === node.id)) throw new Error('node_exists');
    graph.nodes.push(node);
    await this.saveGraph(graph);
  }

  async updateNode(id: string, updates: Partial<GraphNode>): Promise<boolean> {
    const graph = await this.loadGraph();
    const idx = graph.nodes.findIndex(n => n.id === id);
    if (idx === -1) return false;
    graph.nodes[idx] = { ...graph.nodes[idx], ...updates };
    await this.saveGraph(graph);
    return true;
  }

  async deleteNode(id: string): Promise<boolean> {
    const graph = await this.loadGraph();
    const before = graph.nodes.length;
    graph.nodes = graph.nodes.filter(n => n.id !== id);
    graph.edges = graph.edges.filter(e => e.from !== id && e.to !== id);
    if (graph.nodes.length === before) return false;
    await this.saveGraph(graph);
    return true;
  }

  async addEdge(edge: GraphEdge): Promise<void> {
    const graph = await this.loadGraph();
    if (graph.edges.find(e => e.id === edge.id)) throw new Error('edge_exists');
    // ensure endpoints exist
    if (!graph.nodes.find(n => n.id === edge.from) || !graph.nodes.find(n => n.id === edge.to)) {
      throw new Error('endpoint_missing');
    }
    graph.edges.push(edge);
    await this.saveGraph(graph);
  }

  async deleteEdge(id: string): Promise<boolean> {
    const graph = await this.loadGraph();
    const before = graph.edges.length;
    graph.edges = graph.edges.filter(e => e.id !== id);
    if (graph.edges.length === before) return false;
    await this.saveGraph(graph);
    return true;
  }

  async findNodesByType(type: GraphNodeType): Promise<GraphNode[]> {
    const graph = await this.loadGraph();
    return graph.nodes.filter(n => n.type === type);
  }

  async findNode(id: string): Promise<GraphNode | null> {
    const graph = await this.loadGraph();
    return graph.nodes.find(n => n.id === id) || null;
  }

  // Small helper to produce a mermaid graph (simple flowchart)
  async toMermaid(): Promise<string> {
    const graph = await this.loadGraph();
    const lines: string[] = ['flowchart LR'];
    for (const n of graph.nodes) {
      const label = (n.label || n.id).replace(/"/g, '');
      lines.push(`${n.id}["${label}"]`);
    }
    for (const e of graph.edges) {
      const lbl = e.label ? `|${e.label}|` : '';
      lines.push(`${e.from} -->${lbl} ${e.to}`);
    }
    return lines.join('\n');
  }
}

export default GraphService;
