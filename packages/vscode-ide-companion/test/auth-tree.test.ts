import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BASE_LAYOUT = [
  {
    id: 'primary',
    label: 'Primary Providers',
    kind: 'group',
    icon: '⭐',
    children: [
      {
        id: 'openai',
        label: 'OpenAI (GPT-4)',
        kind: 'provider',
        providerId: 'openai',
        envVar: 'OPENAI_API_KEY'
      },
      {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        kind: 'provider',
        providerId: 'anthropic',
        envVar: 'ANTHROPIC_API_KEY'
      }
    ]
  },
  {
    id: 'crud',
    label: 'Provider Management',
    kind: 'group',
    icon: '🛠',
    children: [
      {
        id: 'crud-list',
        label: 'List Providers',
        kind: 'crud',
        crudAction: 'LIST'
      }
    ]
  }
];

const HTML_FIXTURE = `
<div class="auth-tree-container">
  <div class="split-pane">
    <div class="left-panel">
      <div class="panel-controls">
        <button id="refresh-btn" type="button"></button>
        <button id="add-provider-btn" type="button"></button>
      </div>
      <div class="tree-list" role="tree" aria-label="Providers"></div>
    </div>
    <div class="right-panel">
      <div class="detail-panel">
        <div class="breadcrumb-bar">
          <span id="breadcrumb-path"></span>
        </div>
        <div class="detail-content">
          <div class="detail-actions">
            <button id="edit-btn" class="btn btn-secondary" type="button"></button>
            <button id="delete-btn" class="btn btn-danger" type="button"></button>
            <button id="save-btn" class="btn btn-success hidden" type="button"></button>
            <button id="cancel-btn" class="btn btn-secondary hidden" type="button"></button>
          </div>
          <div id="detail-view"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-label"></span>
      <span id="status-message"></span>
    </div>
    <div class="status-right">
      <input id="status-search" type="search" />
      <span id="status-count"></span>
      <span id="status-last-updated"></span>
    </div>
  </div>
</div>
<div id="add-provider-modal" class="modal">
  <div class="modal-content">
    <form id="add-provider-form"></form>
    <div class="modal-footer">
      <button id="modal-cancel" type="button"></button>
      <button id="modal-save" type="button"></button>
    </div>
    <button class="modal-close" type="button"></button>
  </div>
</div>
<select id="provider-select"></select>
<input id="base-url" />
<input id="api-key" />
<input id="enabled" type="checkbox" />
`;

async function createManager(mockProviders: any[], layoutOverride?: any) {
  document.body.innerHTML = HTML_FIXTURE;
  const module = await import('../public/auth-tree.js');
  const { AuthTreeManager } = module;

  const layoutPayload = layoutOverride
    ? JSON.parse(JSON.stringify(layoutOverride))
    : JSON.parse(JSON.stringify(BASE_LAYOUT));

  const fetchMock = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/auth/layout')) {
      return {
        ok: true,
        json: async () => ({ ok: true, layout: layoutPayload })
      } as Response;
    }
    if (url.endsWith('/auth/providers')) {
      return {
        ok: true,
        json: async () => ({ ok: true, providers: mockProviders })
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  const manager = new AuthTreeManager();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  return manager;
}

describe('AuthTreeManager UI facade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders configured providers with base URLs in the tree list', async () => {
    const mockProviders = [
      {
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        enabled: true,
        bayesWeight: 1.0
      },
      {
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com/v1',
        enabled: true,
        bayesWeight: 1.0
      }
    ];

    const manager = await createManager(mockProviders);
    expect(manager.providers).toHaveLength(2);

    const configured = document.querySelector('[data-item-key="provider-openai"]');
    expect(configured).toBeTruthy();
    expect(configured?.getAttribute('data-configured')).toBe('true');
    expect(configured?.querySelector('.tree-item-sub')?.textContent).toContain('https://api.openai.com/v1');

    const providerNodes = document.querySelectorAll('[data-item-type="provider"]');
    expect(providerNodes.length).toBeGreaterThan(0);
  });

  it('uses compressed ellipsis in breadcrumbs for long provider labels', async () => {
    const longName =
      'THIS-PROVIDER-NAME-IS-DELiberately-EXTREMELY-LONG-TO-TRIGGER-MIDDLE-ELLIPSIS';
    const customLayout = JSON.parse(JSON.stringify(BASE_LAYOUT));
    const firstGroup = customLayout[0];
    if (firstGroup?.children?.[0]) {
      firstGroup.children[0].label = longName;
    }

    const manager = await createManager(
      [
        {
          provider: 'openai',
          baseURL: 'https://example.com/path/to/resource',
          enabled: true,
          bayesWeight: 1.0
        }
      ],
      customLayout
    );

    const item = manager.itemByKey.get('provider-openai');
    expect(item).toBeTruthy();
    manager.selectPrimaryItem(item!);

    const trail = document.getElementById('breadcrumb-path')?.textContent || '';
    expect(trail).toContain('…');
    expect(trail.startsWith('Providers')).toBe(true);
  });

  it('keeps provider selection when rebuilding the tree after search', async () => {
    const mockProviders = [
      { provider: 'openai', baseURL: 'https://api.openai.com/v1', enabled: true, bayesWeight: 1 },
      { provider: 'anthropic', baseURL: 'https://api.anthropic.com/v1', enabled: true, bayesWeight: 1 }
    ];

    const manager = await createManager(mockProviders);
    const target = manager.itemByKey.get('provider-anthropic');
    expect(target).toBeTruthy();
    manager.selectPrimaryItem(target!);
    expect(manager.selectedKeys.has('provider-anthropic')).toBe(true);

    manager.searchTerm = 'openai';
    manager.refreshTree();

    expect(manager.selectedKeys.has('provider-anthropic')).toBe(false);
    expect(manager.primarySelectionKey).toBeNull();
  });
});
