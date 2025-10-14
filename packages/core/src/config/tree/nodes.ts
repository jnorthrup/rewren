/**
 * Tree node classes for Quota/Provider/Model/Config/Metrics
 * Implements raw JSON serde and env-only API key storage.
 */

import { Providers } from '../providers.js';

export type NodeType = 'root' | 'provider' | 'model' | 'quota' | 'config' | 'metrics';

export interface RawNode {
  id: string;
  type: NodeType;
  data?: Record<string, any>;
  children?: RawNode[];
}

export abstract class TreeNode {
  readonly id: string;
  readonly type: NodeType;
  children: TreeNode[] = [];

  constructor(id: string, type: NodeType, children: TreeNode[] = []) {
    this.id = id;
    this.type = type;
    this.children = children;
  }

  addChild(node: TreeNode) {
    this.children.push(node);
  }

  toRaw(): RawNode {
    return {
      id: this.id,
      type: this.type,
      data: this.toRawData(),
      children: this.children.map((c) => c.toRaw()),
    };
  }

  abstract toRawData(): Record<string, any> | undefined;

  static fromRaw(raw: RawNode): TreeNode {
    switch (raw.type) {
      case 'root':
        return RootNode.fromRaw(raw);
      case 'provider':
        return ProviderNode.fromRaw(raw);
      case 'model':
        return ModelNode.fromRaw(raw);
      case 'quota':
        return QuotaNode.fromRaw(raw);
      case 'config':
        return ConfigNode.fromRaw(raw);
      case 'metrics':
        return MetricsNode.fromRaw(raw);
      default:
        throw new Error(`Unknown node type: ${raw.type}`);
    }
  }
}

export class RootNode extends TreeNode {
  constructor(id = 'root', children: TreeNode[] = []) {
    super(id, 'root', children);
  }

  toRawData() {
    return undefined;
  }

  static fromRaw(raw: RawNode) {
    const node = new RootNode(raw.id);
    if (raw.children) {
      node.children = raw.children.map(TreeNode.fromRaw);
    }
    return node;
  }
}

export class ProviderNode extends TreeNode {
  readonly provider: Providers | string;
  readonly envVarName?: string;

  constructor(id: string, provider: Providers | string, envVarName?: string, children: TreeNode[] = []) {
    super(id, 'provider', children);
    this.provider = provider;
    this.envVarName = envVarName;
  }

  getApiKey(): string | undefined {
    if (!this.envVarName) return undefined;
    return process.env[this.envVarName];
  }

  toRawData() {
    // Do NOT serialize secrets. Only store the env var name.
    return {
      provider: this.provider,
      envVarName: this.envVarName,
    };
  }

  static fromRaw(raw: RawNode) {
    const data = raw.data || {};
    const node = new ProviderNode(raw.id, data.provider, data.envVarName);
    if (raw.children) node.children = raw.children.map(TreeNode.fromRaw);
    return node;
  }
}

export class ModelNode extends TreeNode {
  readonly name: string;
  readonly tokenLimit?: number;
  readonly description?: string;
  readonly capabilities?: Record<string, any>;

  constructor(id: string, name: string, tokenLimit?: number, description?: string, capabilities?: Record<string, any>, children: TreeNode[] = []) {
    super(id, 'model', children);
    this.name = name;
    this.tokenLimit = tokenLimit;
    this.description = description;
    this.capabilities = capabilities;
  }

  toRawData() {
    return {
      name: this.name,
      tokenLimit: this.tokenLimit,
      description: this.description,
      capabilities: this.capabilities,
    };
  }

  static fromRaw(raw: RawNode) {
    const data = raw.data || {};
    const node = new ModelNode(raw.id, data.name, data.tokenLimit, data.description, data.capabilities);
    if (raw.children) node.children = raw.children.map(TreeNode.fromRaw);
    return node;
  }
}

export class QuotaNode extends TreeNode {
  readonly limit: number;
  readonly used: number;

  constructor(id: string, limit: number, used = 0, children: TreeNode[] = []) {
    super(id, 'quota', children);
    this.limit = limit;
    this.used = used;
  }

  toRawData() {
    return {
      limit: this.limit,
      used: this.used,
    };
  }

  static fromRaw(raw: RawNode) {
    const data = raw.data || {};
    const node = new QuotaNode(raw.id, data.limit ?? 0, data.used ?? 0);
    if (raw.children) node.children = raw.children.map(TreeNode.fromRaw);
    return node;
  }
}

export class ConfigNode extends TreeNode {
  readonly settings: Record<string, any>;

  constructor(id: string, settings: Record<string, any> = {}, children: TreeNode[] = []) {
    super(id, 'config', children);
    this.settings = settings;
  }

  toRawData() {
    return { settings: this.settings };
  }

  static fromRaw(raw: RawNode) {
    const data = raw.data || {};
    const node = new ConfigNode(raw.id, data.settings || {});
    if (raw.children) node.children = raw.children.map(TreeNode.fromRaw);
    return node;
  }
}

export class MetricsNode extends TreeNode {
  readonly metrics: Record<string, number>;

  constructor(id: string, metrics: Record<string, number> = {}, children: TreeNode[] = []) {
    super(id, 'metrics', children);
    this.metrics = metrics;
  }

  toRawData() {
    return { metrics: this.metrics };
  }

  static fromRaw(raw: RawNode) {
    const data = raw.data || {};
    const node = new MetricsNode(raw.id, data.metrics || {});
    if (raw.children) node.children = raw.children.map(TreeNode.fromRaw);
    return node;
  }
}

export function serializeTree(root: TreeNode): string {
  return JSON.stringify(root.toRaw());
}

export function deserializeTree(serialized: string): TreeNode {
  const raw = JSON.parse(serialized) as RawNode;
  return TreeNode.fromRaw(raw);
}