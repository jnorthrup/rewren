/**
 * Shared auth tree layout definitions used by both the CLI TUI and the web UI.
 */

import { Providers, providerDisplayName } from './providers.js';
import { AuthType } from '../core/contentGenerator.js';

export type AuthTreeNodeKind = 'group' | 'provider' | 'crud' | 'auth';

export interface AuthTreeNode {
  id: string;
  label: string;
  kind: AuthTreeNodeKind;
  icon?: string;
  envVar?: string;
  providerId?: Providers;
  authType?: AuthType;
  crudAction?:
    | 'CREATE'
    | 'LIST'
    | 'EDIT'
    | 'DELETE'
    | 'TEST'
    | 'ANALYTICS'
    | 'RESET'
    | 'EXPORT'
    | 'IMPORT';
  children?: AuthTreeNode[];
}

function providerNode(
  id: Providers,
  options: {
    envVar: string;
    authType?: AuthType;
    icon?: string;
    label?: string;
  }
): AuthTreeNode {
  return {
    id,
    label: options.label ?? providerDisplayName(id),
    kind: 'provider',
    icon: options.icon,
    envVar: options.envVar,
    providerId: id,
    authType: options.authType ?? AuthType.USE_OPENAI_COMPATIBLE
  };
}

function crudNode(
  id: string,
  label: string,
  crudAction: NonNullable<AuthTreeNode['crudAction']>,
  icon?: string
): AuthTreeNode {
  return {
    id,
    label,
    kind: 'crud',
    icon,
    crudAction
  };
}

function authMethodNode(
  id: string,
  label: string,
  authType: AuthType,
  icon?: string
): AuthTreeNode {
  return {
    id,
    label,
    kind: 'auth',
    icon,
    authType
  };
}

export const AUTH_TREE_LAYOUT: AuthTreeNode[] = [
  {
    id: 'primary',
    label: 'Primary Providers',
    kind: 'group',
    icon: '⭐',
    children: [
      providerNode(Providers.OPENAI, {
        envVar: 'OPENAI_API_KEY',
        label: 'OpenAI (GPT-4 / o1)',
        icon: '🤖'
      }),
      providerNode(Providers.ANTHROPIC, {
        envVar: 'ANTHROPIC_API_KEY',
        label: 'Anthropic (Claude)',
        icon: '🧠'
      }),
      providerNode(Providers.GOOGLE, {
        envVar: 'GEMINI_API_KEY',
        label: 'Google Gemini',
        authType: AuthType.USE_GEMINI,
        icon: '🔭'
      }),
      providerNode(Providers.GOOGLE_VERTEX, {
        envVar: 'GOOGLE_CLOUD_PROJECT',
        label: 'Google Vertex AI',
        authType: AuthType.USE_VERTEX_AI,
        icon: '🛠'
      })
    ]
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-Compatible',
    kind: 'group',
    icon: '🧩',
    children: [
      providerNode(Providers.NVIDIA, {
        envVar: 'NVIDIA_API_KEY',
        label: 'NVIDIA (Kimi K2)',
        icon: '🎮'
      }),
      providerNode(Providers.DEEPSEEK, {
        envVar: 'DEEPSEEK_API_KEY',
        icon: '🔭'
      }),
      providerNode(Providers.OPENROUTER, {
        envVar: 'OPENROUTER_API_KEY',
        icon: '🛣️'
      }),
      providerNode(Providers.GROQ, {
        envVar: 'GROQ_API_KEY',
        icon: '⚡'
      }),
      providerNode(Providers.KILO, {
        envVar: 'KILO_API_KEY',
        icon: '📐'
      }),
      providerNode(Providers.FIREWORKS_AI, {
        envVar: 'FIREWORKS_API_KEY',
        icon: '🎆'
      }),
      providerNode(Providers.CORE42, {
        envVar: 'CORE42_API_KEY',
        icon: '🏜️'
      })
    ]
  },
  {
    id: 'regional',
    label: 'Regional Providers',
    kind: 'group',
    icon: '🌐',
    children: [
      providerNode(Providers.QWEN, {
        envVar: 'QWEN_API_KEY',
        label: 'Qwen (Alibaba)',
        icon: '🐉'
      }),
      providerNode(Providers.MOONSHOT_AI, {
        envVar: 'MOONSHOT_API_KEY',
        label: 'Moonshot AI',
        icon: '🌙'
      }),
      providerNode(Providers.MISTRAL, {
        envVar: 'MISTRAL_API_KEY',
        label: 'Mistral AI',
        icon: '🌫️'
      }),
      providerNode(Providers.COHERE, {
        envVar: 'COHERE_API_KEY',
        icon: '🔗'
      }),
      providerNode(Providers.CEREBRAS, {
        envVar: 'CEREBRAS_API_KEY',
        icon: '🧠'
      }),
      providerNode(Providers.ZAI, {
        envVar: 'ZAI_API_KEY',
        icon: '🀄'
      })
    ]
  },
  {
    id: 'alternative',
    label: 'Alternative Providers',
    kind: 'group',
    icon: '✨',
    children: [
      providerNode(Providers.XAI, {
        envVar: 'XAI_API_KEY',
        label: 'xAI (Grok)',
        icon: '🌀'
      }),
      providerNode(Providers.LLAMA, {
        envVar: 'META_API_KEY',
        label: 'Meta AI (Llama)',
        icon: '🦙'
      }),
      providerNode(Providers.HUGGINGFACE, {
        envVar: 'HUGGINGFACE_API_KEY',
        icon: '🤗'
      }),
      providerNode(Providers.AMAZON_BEDROCK, {
        envVar: 'AWS_ACCESS_KEY_ID',
        label: 'Amazon Bedrock',
        icon: '🪨'
      }),
      providerNode(Providers.AI21_LABS, {
        envVar: 'AI21_API_KEY',
        label: 'AI21 Labs',
        icon: '🧬'
      }),
      providerNode(Providers.PERPLEXITY, {
        envVar: 'PERPLEXITY_API_KEY',
        icon: '❓'
      })
    ]
  },
  {
    id: 'crud',
    label: 'Provider Management',
    kind: 'group',
    icon: '🛠',
    children: [
      crudNode('crud-create', 'Create Provider', 'CREATE', '➕'),
      crudNode('crud-list', 'List Providers', 'LIST', '📋'),
      crudNode('crud-edit', 'Edit Provider', 'EDIT', '✏️'),
      crudNode('crud-delete', 'Delete Provider', 'DELETE', '🗑️'),
      crudNode('crud-test', 'Test Connections', 'TEST', '🧪'),
      crudNode('crud-analytics', 'View Analytics', 'ANALYTICS', '📊'),
      crudNode('crud-reset', 'Reset Stats', 'RESET', '🔄'),
      crudNode('crud-export', 'Export Config', 'EXPORT', '📤'),
      crudNode('crud-import', 'Import Config', 'IMPORT', '📥')
    ]
  },
  {
    id: 'auth-methods',
    label: 'Authentication Methods',
    kind: 'group',
    icon: '🔐',
    children: [
      authMethodNode('cloud-shell', 'Google Cloud Shell', AuthType.CLOUD_SHELL, '☁️'),
      authMethodNode('login-google', 'Login with Google', AuthType.LOGIN_WITH_GOOGLE, '🔑')
    ]
  }
];

export function flattenAuthTree(nodes: AuthTreeNode[]): AuthTreeNode[] {
  const result: AuthTreeNode[] = [];
  const traverse = (list: AuthTreeNode[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return result;
}

export const AUTH_TREE_PROVIDER_NODE_IDS = new Set(
  AUTH_TREE_LAYOUT.flatMap((group) =>
    (group.children ?? [])
      .filter((child) => child.kind === 'provider')
      .map((child) => child.id)
  )
);
