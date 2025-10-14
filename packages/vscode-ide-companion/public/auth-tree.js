import { AuthTreeUtils } from './auth-tree-utils.mjs';

class AuthTreeManager {
  constructor() {
    this.apiBase = window.location.origin;

    this.layout = [];
    this.totalProviderCount = 0;
    this.expandedGroups = new Set();

    this.providers = [];
    this.providerMap = new Map();

    this.flatItems = [];
    this.itemByKey = new Map();
    this.itemElements = new Map();

    this.selectedKeys = new Set();
    this.primarySelectionKey = null;
    this.focusedIndex = -1;

    this.searchTerm = '';
    this.visibleProviderCount = 0;
    this.editMode = false;

    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.loadLayout();
    await this.loadProviders();
    this.refreshTree();
    this.renderDetailView();
    this.updateBreadcrumbs();
    this.updateStatusBar();
    this.showStatusMessage('Auth Tree Manager ready');
  }

  bindElements() {
    this.treeList = document.querySelector('.tree-list');
    this.detailView = document.getElementById('detail-view');
    this.breadcrumbPath = document.getElementById('breadcrumb-path');

    this.statusMessage = document.getElementById('status-message');
    this.statusCount = document.getElementById('status-count');
    this.statusLastUpdated = document.getElementById('status-last-updated');
    this.searchInput = document.getElementById('status-search');

    this.editBtn = document.getElementById('edit-btn');
    this.deleteBtn = document.getElementById('delete-btn');
    this.saveBtn = document.getElementById('save-btn');
    this.cancelBtn = document.getElementById('cancel-btn');

    this.refreshBtn = document.getElementById('refresh-btn');
    this.addProviderBtn = document.getElementById('add-provider-btn');

    this.addProviderModal = document.getElementById('add-provider-modal');
    this.addProviderForm = document.getElementById('add-provider-form');
    this.providerSelect = document.getElementById('provider-select');
    this.baseUrlInput = document.getElementById('base-url');
    this.apiKeyInput = document.getElementById('api-key');
    this.enabledCheckbox = document.getElementById('enabled');
    this.modalSaveBtn = document.getElementById('modal-save');
    this.modalCancelBtn = document.getElementById('modal-cancel');
    this.modalCloseBtn = document.querySelector('.modal-close');
  }

  bindEvents() {
    if (this.treeList) {
      this.treeList.addEventListener('click', (event) => this.handleTreeClick(event));
    }

    this.refreshBtn?.addEventListener('click', () => this.refresh());
    this.addProviderBtn?.addEventListener('click', () => this.showAddProviderModal());

    this.editBtn?.addEventListener('click', () => this.enterEditMode());
    this.deleteBtn?.addEventListener('click', () => this.deleteSelection());
    this.saveBtn?.addEventListener('click', () => this.saveChanges());
    this.cancelBtn?.addEventListener('click', () => this.exitEditMode());

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (event) => {
        this.searchTerm = (event.target.value || '').trim().toLowerCase();
        this.refreshTree();
      });
      this.searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.searchTerm) {
          event.preventDefault();
          this.clearSearch();
        }
      });
    }

    if (this.addProviderForm) {
      this.addProviderForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.addProvider();
      });
    }
    this.modalSaveBtn?.addEventListener('click', () => this.addProvider());
    this.modalCancelBtn?.addEventListener('click', () => this.hideAddProviderModal());
    this.modalCloseBtn?.addEventListener('click', () => this.hideAddProviderModal());

    if (this.addProviderModal) {
      this.addProviderModal.addEventListener('click', (event) => {
        if (event.target === this.addProviderModal) {
          this.hideAddProviderModal();
        }
      });
    }

    document.addEventListener('keydown', (event) => this.handleGlobalKey(event));
  }

  async loadLayout() {
    try {
      const response = await fetch(`${this.apiBase}/auth/layout`);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.layout)) {
        throw new Error('Invalid layout payload');
      }
      this.layout = data.layout;
      this.totalProviderCount = this.countProviderNodes(this.layout);
      this.expandedGroups = new Set(
        this.layout.filter((node) => node.kind === 'group').map((node) => node.id)
      );
    } catch (error) {
      console.error('Error loading auth tree layout:', error);
      this.layout = [];
      this.totalProviderCount = 0;
      this.expandedGroups = new Set();
    }
  }

  async loadProviders() {
    try {
      this.showStatusMessage('Loading providers…');
      const providers = await this.apiListProviders();
      this.providers = Array.isArray(providers) ? providers : [];
      this.providerMap = new Map(this.providers.map((provider) => [String(provider.provider), provider]));
      this.showStatusMessage(`Loaded ${this.providers.length} providers`);
    } catch (error) {
      console.error('Error loading providers', error);
      this.providers = [];
      this.providerMap.clear();
      this.showStatusMessage(`Error loading providers: ${(error && error.message) || error}`, 'error');
    }
  }

  refreshTree() {
    const { items, providerCount } = this.buildFlatItems();
    this.flatItems = items;
    this.visibleProviderCount = providerCount;

    this.itemByKey = new Map(items.map((item) => [item.key, item]));
    const validKeys = new Set(this.itemByKey.keys());

    this.selectedKeys.forEach((key) => {
      if (!validKeys.has(key)) {
        this.selectedKeys.delete(key);
      }
    });

    if (!this.primarySelectionKey || !validKeys.has(this.primarySelectionKey)) {
      const firstSelected = [...this.selectedKeys][0];
      this.primarySelectionKey = firstSelected ?? null;
    }

    if (this.focusedIndex >= this.flatItems.length) {
      this.focusedIndex = this.flatItems.length - 1;
    }
    if (this.focusedIndex < 0 && this.flatItems.length > 0) {
      this.focusedIndex = 0;
    }

    this.renderTreeList();
    this.refreshItemStates();
    this.updateBreadcrumbs();
    this.updateStatusBar();
  }

  buildFlatItems() {
    const items = [];
    let providerCount = 0;
    const term = this.searchTerm;
    const autoExpand = Boolean(term);

    const matches = (text) => {
      if (!term) {
        return true;
      }
      return (text || '').toLowerCase().includes(term);
    };

    const visit = (node, depth) => {
      const kind = node.kind;
      if (kind === 'group') {
        const childNodes = Array.isArray(node.children) ? node.children : [];
        const childEntries = [];
        let childProviderCount = 0;
        let hasMatch = matches(node.label);

        for (const child of childNodes) {
          const result = visit(child, depth + 1);
          childProviderCount += result.providerCount;
          if (result.matched) {
            childEntries.push(...result.entries);
            hasMatch = true;
          }
        }

        if (!hasMatch) {
          return { matched: false, entries: [], providerCount: childProviderCount };
        }

        const expanded = autoExpand || this.expandedGroups.has(node.id);
        const groupEntry = {
          key: `group-${node.id}`,
          type: 'group',
          label: node.icon ? `${node.icon} ${node.label}` : node.label,
          details: childProviderCount ? `${childProviderCount} provider${childProviderCount === 1 ? '' : 's'}` : '',
          icon: node.icon,
          depth,
          layoutNode: node,
          expanded
        };

        const entries = [groupEntry];
        if (expanded) {
          entries.push(...childEntries);
        }

        return { matched: true, entries, providerCount: childProviderCount };
      }

      if (kind === 'provider') {
        const providerId = node.providerId ?? node.id;
        const config = this.providerMap.get(String(providerId)) || null;
        const haystack = [
          node.label,
          node.id,
          node.envVar,
          config?.provider,
          config?.baseURL,
          config?.apiKey ? 'configured' : ''
        ]
          .join(' ')
          .toLowerCase();

        if (!matches(haystack)) {
          return { matched: false, entries: [], providerCount: 0 };
        }

        const details = config?.baseURL ? config.baseURL : node.envVar ? `Env: ${node.envVar}` : 'Not configured';
        const entry = {
          key: `provider-${providerId}`,
          type: 'provider',
          label: node.icon ? `${node.icon} ${node.label}` : node.label,
          details,
          icon: node.icon,
          depth,
          layoutNode: node,
          config,
          hasConfig: Boolean(config)
        };

        providerCount += 1;
        return { matched: true, entries: [entry], providerCount: 1 };
      }

      if (kind === 'crud') {
        const haystack = `${node.label} ${node.crudAction || ''}`.toLowerCase();
        if (!matches(haystack)) {
          return { matched: false, entries: [], providerCount: 0 };
        }
        const entry = {
          key: `crud-${node.id}`,
          type: 'crud',
          label: node.icon ? `${node.icon} ${node.label}` : node.label,
          details: node.crudAction ?? '',
          icon: node.icon,
          depth,
          layoutNode: node
        };
        return { matched: true, entries: [entry], providerCount: 0 };
      }

      // auth node
      const haystack = `${node.label} ${node.authType || ''}`.toLowerCase();
      if (!matches(haystack)) {
        return { matched: false, entries: [], providerCount: 0 };
      }
      const entry = {
        key: `auth-${node.id}`,
        type: 'auth',
        label: node.icon ? `${node.icon} ${node.label}` : node.label,
        details: '',
        icon: node.icon,
        depth,
        layoutNode: node
      };
      return { matched: true, entries: [entry], providerCount: 0 };
    };

    for (const node of this.layout) {
      const result = visit(node, 0);
      if (result.matched) {
        items.push(...result.entries);
        providerCount += result.providerCount;
      }
    }

    return { items, providerCount };
  }

  handleTreeClick(event) {
    const element = event.target.closest('[data-item-key]');
    if (!element) {
      return;
    }
    const key = element.dataset.itemKey;
    const item = this.itemByKey.get(key);
    if (!item) {
      return;
    }

    if (item.type === 'group') {
      this.toggleGroupExpansion(item.layoutNode.id);
      return;
    }

    const index = this.flatItems.findIndex((entry) => entry.key === item.key);
    if (index >= 0) {
      this.focusedIndex = index;
    }

    if ((event.metaKey || event.ctrlKey) && item.type === 'provider') {
      this.toggleItemSelection(item);
    } else {
      this.selectPrimaryItem(item);
    }
  }

  handleGlobalKey(event) {
    if (this.isTypingInInput(event.target)) {
      return;
    }

    switch (event.key) {
      case '/':
        event.preventDefault();
        this.focusSearch();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(-1);
        break;
      case ' ':
        event.preventDefault();
        this.handleFocusedActivation(true);
        break;
      case 'Enter':
        event.preventDefault();
        this.handleFocusedActivation(false);
        break;
      case 'Escape':
        event.preventDefault();
        this.handleEscape();
        break;
      case 'F5':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          this.refresh();
        }
        break;
      default:
        break;
    }
  }

  handleFocusedActivation(toggleOnly) {
    if (this.focusedIndex < 0 || this.focusedIndex >= this.flatItems.length) {
      return;
    }
    const item = this.flatItems[this.focusedIndex];
    if (item.type === 'group') {
      this.toggleGroupExpansion(item.layoutNode.id);
      return;
    }

    if (toggleOnly && item.type === 'provider') {
      this.toggleItemSelection(item);
      return;
    }

    this.selectPrimaryItem(item);
  }

  handleEscape() {
    if (this.editMode) {
      this.exitEditMode();
      return;
    }
    if (this.addProviderModal?.classList.contains('show')) {
      this.hideAddProviderModal();
      return;
    }
    if (this.searchTerm) {
      this.clearSearch();
      return;
    }
    this.clearSelection();
  }

  moveFocus(delta) {
    if (this.flatItems.length === 0) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(this.flatItems.length - 1, this.focusedIndex + delta));
    if (nextIndex !== this.focusedIndex) {
      this.focusedIndex = nextIndex;
      const focusedItem = this.flatItems[this.focusedIndex];
      this.scrollItemIntoView(focusedItem.key);
      this.refreshItemStates();
    }
  }

  toggleGroupExpansion(groupId) {
    if (this.expandedGroups.has(groupId)) {
      this.expandedGroups.delete(groupId);
    } else {
      this.expandedGroups.add(groupId);
    }
    this.refreshTree();
  }

  toggleItemSelection(item) {
    if (item.type !== 'provider') {
      return;
    }
    if (this.selectedKeys.has(item.key)) {
      this.selectedKeys.delete(item.key);
      if (this.primarySelectionKey === item.key) {
        this.primarySelectionKey = [...this.selectedKeys][0] ?? null;
      }
    } else {
      this.selectedKeys.add(item.key);
      this.primarySelectionKey = item.key;
    }
    this.refreshItemStates();
    this.renderDetailView();
    this.updateBreadcrumbs();
    this.updateStatusBar();
  }

  selectPrimaryItem(item) {
    this.selectedKeys.clear();
    if (item.type === 'provider') {
      this.selectedKeys.add(item.key);
    }
    this.primarySelectionKey = item.type === 'group' ? null : item.key;
    this.editMode = false;
    this.refreshItemStates();
    this.renderDetailView();
    this.updateBreadcrumbs();
    this.updateStatusBar();
    if (item.type === 'crud') {
      this.describeCrudAction(item);
    } else if (item.type === 'auth') {
      this.showStatusMessage(`Selected auth method: ${item.label}`);
    }
  }

  clearSelection() {
    this.selectedKeys.clear();
    this.primarySelectionKey = null;
    this.editMode = false;
    this.refreshItemStates();
    this.renderDetailView();
    this.updateBreadcrumbs();
    this.updateStatusBar();
  }

  renderTreeList() {
    if (!this.treeList) {
      return;
    }
    this.treeList.innerHTML = '';
    this.itemElements.clear();

    const fragment = document.createDocumentFragment();
    for (const item of this.flatItems) {
      const element = this.createTreeItemElement(item);
      fragment.appendChild(element);
      this.itemElements.set(item.key, element);
    }
    this.treeList.appendChild(fragment);
  }

  createTreeItemElement(item) {
    const element = document.createElement('div');
    element.className = `tree-item ${item.type}`;
    element.dataset.itemKey = item.key;
    element.dataset.itemType = item.type;
    element.dataset.depth = String(item.depth);
    element.setAttribute('role', 'treeitem');
    if (item.type === 'group') {
      element.dataset.groupId = item.layoutNode.id;
      element.dataset.expanded = item.expanded ? 'true' : 'false';
    }
    if (item.type === 'provider') {
      element.dataset.configured = item.hasConfig ? 'true' : 'false';
    }
    element.style.paddingLeft = `${20 + item.depth * 18}px`;

    const prefix = item.type === 'group'
      ? (item.expanded ? '▼ ' : '▶ ')
      : item.depth > 0 ? '• ' : '';

    const title = document.createElement('div');
    title.className = 'tree-item-title';
    title.textContent = `${prefix}${item.label}`;

    const body = document.createElement('div');
    body.className = 'tree-item-body';
    body.appendChild(title);

    if (item.details) {
      const details = document.createElement('div');
      details.className = 'tree-item-sub';
      details.textContent = AuthTreeUtils.truncateMiddle(item.details, 60);
      body.appendChild(details);
    }

    element.appendChild(body);
    return element;
  }

  refreshItemStates() {
    const focusedItem = this.flatItems[this.focusedIndex];
    const focusedKey = focusedItem?.key ?? null;

    this.itemElements.forEach((element, key) => {
      const isSelected = this.selectedKeys.has(key);
      const isFocused = key === focusedKey;
      element.classList.toggle('selected', isSelected);
      element.classList.toggle('focused', isFocused);
      element.classList.toggle('caret', isFocused);
    });
  }

  scrollItemIntoView(key) {
    const element = this.itemElements.get(key);
    if (element) {
      element.scrollIntoView({ block: 'nearest' });
    }
  }

  getSelectionItem() {
    if (!this.primarySelectionKey) {
      return null;
    }
    return this.itemByKey.get(this.primarySelectionKey) || null;
  }

  updateBreadcrumbs() {
    if (!this.breadcrumbPath) {
      return;
    }
    const item = this.getSelectionItem();
    if (!item) {
      this.breadcrumbPath.textContent = 'Providers';
      return;
    }
    this.breadcrumbPath.textContent = AuthTreeUtils.buildBreadcrumbPath(item.layoutNode);
  }

  renderDetailView() {
    if (!this.detailView) {
      return;
    }
    const selection = this.getSelectionItem();
    if (!selection) {
      this.detailView.classList.remove('edit-mode');
      this.detailView.innerHTML = `
        <div class="detail-placeholder">
          <div class="placeholder-icon" aria-hidden="true">👆</div>
          <div class="placeholder-text">Select an item to view details</div>
        </div>
      `;
      this.updateActionButtons();
      return;
    }

    if (selection.type === 'provider') {
      this.renderProviderDetail(selection);
    } else if (selection.type === 'crud') {
      this.renderCrudDetail(selection);
    } else if (selection.type === 'auth') {
      this.renderAuthDetail(selection);
    } else if (selection.type === 'group') {
      this.renderGroupDetail(selection);
    }
    this.detailView.classList.toggle('edit-mode', this.editMode);
    this.updateActionButtons();
  }

  renderProviderDetail(selection) {
    const layout = selection.layoutNode;
    const config = selection.config || null;

    const enabled = config?.enabled ?? false;
    const baseURL = config?.baseURL ?? '';
    const bayesWeight = typeof config?.bayesWeight === 'number' ? config.bayesWeight : 1;
    const created = config?.createdAt ? new Date(config.createdAt).toLocaleString() : '—';
    const updated = config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : '—';
    const statusLabel = config ? (enabled ? 'Enabled' : 'Disabled') : 'Not configured';
    const statusClass = config ? (enabled ? 'enabled' : 'disabled') : 'missing';

    const envVar = layout.envVar ? `<div class="detail-item"><div class="detail-label">Env Var</div><div class="detail-value">${layout.envVar}</div></div>` : '';

    const performance = config?.performance ?? null;

    this.detailView.innerHTML = `
      <div class="provider-detail">
        <div class="detail-section">
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Provider</div>
              <div class="detail-value">${layout.label}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Status</div>
              <div class="detail-value ${statusClass}">${statusLabel}</div>
              <select class="detail-input" data-field="enabled">
                <option value="true" ${enabled ? 'selected' : ''}>Enabled</option>
                <option value="false" ${!enabled ? 'selected' : ''}>Disabled</option>
              </select>
            </div>
            <div class="detail-item">
              <div class="detail-label">Base URL</div>
              <div class="detail-value">${baseURL || 'Not configured'}</div>
              <input type="url" class="detail-input" data-field="baseURL" value="${baseURL}" placeholder="https://api.example.com">
            </div>
            <div class="detail-item">
              <div class="detail-label">API Key</div>
              <div class="detail-value">${config?.apiKey ? '••••••••' : 'Not set'}</div>
              <input type="password" class="detail-input" data-field="apiKey" value="${config?.apiKey || ''}" placeholder="Enter API key">
            </div>
            <div class="detail-item">
              <div class="detail-label">Bayes Weight</div>
              <div class="detail-value">${bayesWeight.toFixed(3)}</div>
              <input type="number" class="detail-input" data-field="bayesWeight" step="0.001" value="${bayesWeight}">
            </div>
            ${envVar}
            <div class="detail-item">
              <div class="detail-label">Created</div>
              <div class="detail-value">${created}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Updated</div>
              <div class="detail-value">${updated}</div>
            </div>
          </div>
        </div>
        ${performance ? this.renderPerformanceMetrics(performance) : ''}
      </div>
    `;
  }

  renderPerformanceMetrics(performance) {
    const value = (input, digits = 0) => (typeof input === 'number' ? input.toFixed(digits) : '0');
    return `
      <div class="detail-section">
        <h4>Performance</h4>
        <div class="metrics-grid">
          <div class="metric-card"><div class="metric-value">${value(performance.totalRequests)}</div><div class="metric-label">Total Requests</div></div>
          <div class="metric-card"><div class="metric-value">${value(performance.successCount)}</div><div class="metric-label">Success</div></div>
          <div class="metric-card"><div class="metric-value">${value(performance.failureCount)}</div><div class="metric-label">Failures</div></div>
          <div class="metric-card"><div class="metric-value">${value(performance.errorRate * 100, 1)}%</div><div class="metric-label">Error Rate</div></div>
          <div class="metric-card"><div class="metric-value">${value(performance.avgLatencyMs)}</div><div class="metric-label">Avg Latency</div></div>
          <div class="metric-card"><div class="metric-value">${value(performance.avgTokenPerSecond, 1)}</div><div class="metric-label">Tokens / sec</div></div>
        </div>
      </div>
    `;
  }

  renderCrudDetail(selection) {
    const action = selection.layoutNode.crudAction ?? 'CRUD';
    const instructions = this.describeCrudInstruction(action);
    this.detailView.innerHTML = `
      <div class="static-detail">
        <h4>${selection.label}</h4>
        <p>${instructions}</p>
      </div>
    `;
  }

  renderAuthDetail(selection) {
    this.detailView.innerHTML = `
      <div class="static-detail">
        <h4>${selection.label}</h4>
        <p>Select this method to authenticate via ${selection.label}. Follow the prompts in the CLI after confirmation.</p>
      </div>
    `;
  }

  renderGroupDetail(selection) {
    this.detailView.innerHTML = `
      <div class="static-detail">
        <h4>${selection.label}</h4>
        <p>Expand this section to explore the available providers and actions.</p>
      </div>
    `;
  }

  describeCrudAction(item) {
    const action = item.layoutNode.crudAction ?? '';
    const message = this.describeCrudInstruction(action);
    this.showStatusMessage(message);
  }

  describeCrudInstruction(action) {
    switch (action) {
      case 'CREATE':
        return 'Create Provider: Provide name, base URL, and API key to add a new provider configuration.';
      case 'LIST': {
        if (this.providers.length === 0) {
          return 'No providers configured yet.';
        }
        return `Configured providers:\n${this.providers.map((p) => ` • ${p.provider}`).join('\n')}`;
      }
      case 'EDIT':
        return 'Edit Provider: Select an existing provider to modify its base URL, API key, or status.';
      case 'DELETE':
        return 'Delete Provider: Select a configured provider and use the Delete action to remove it.';
      case 'TEST':
        return 'Test Connections: Runs health checks against each configured provider API.';
      case 'ANALYTICS':
        return 'View Analytics: Displays request metrics, success rates, and latency trends.';
      case 'RESET':
        return 'Reset Stats: Clears stored performance statistics for all providers.';
      case 'EXPORT':
        return 'Export Config: Generate a JSON export of the current provider configuration.';
      case 'IMPORT':
        return 'Import Config: Paste or upload a JSON configuration to merge with existing providers.';
      default:
        return 'Provider management action.';
    }
  }

  updateActionButtons() {
    const selection = this.getSelectionItem();
    const isProvider = selection?.type === 'provider';
    const inEditMode = this.editMode && isProvider;

    if (this.editBtn) {
      this.editBtn.disabled = !isProvider || inEditMode;
      this.editBtn.classList.toggle('hidden', inEditMode);
    }
    if (this.deleteBtn) {
      this.deleteBtn.disabled = !isProvider || !selection?.config;
      this.deleteBtn.classList.toggle('hidden', inEditMode);
    }
    this.saveBtn?.classList.toggle('hidden', !inEditMode);
    this.cancelBtn?.classList.toggle('hidden', !inEditMode);
  }

  enterEditMode() {
    const selection = this.getSelectionItem();
    if (!selection || selection.type !== 'provider') {
      return;
    }
    this.editMode = true;
    this.detailView?.classList.add('edit-mode');
    this.updateActionButtons();
    this.showStatusMessage('Edit mode enabled. Make changes and click Save.');
  }

  exitEditMode() {
    if (!this.editMode) {
      return;
    }
    this.editMode = false;
    this.detailView?.classList.remove('edit-mode');
    this.renderDetailView();
    this.showStatusMessage('Edit mode cancelled');
  }

  async saveChanges() {
    const selection = this.getSelectionItem();
    if (!selection || selection.type !== 'provider') {
      return;
    }

    const inputs = this.detailView?.querySelectorAll('.detail-input');
    if (!inputs || inputs.length === 0) {
      return;
    }

    const updates = {};
    inputs.forEach((input) => {
      const field = input.dataset.field;
      if (!field) {
        return;
      }
      if (field === 'enabled') {
        updates.enabled = input.value === 'true';
      } else if (field === 'bayesWeight') {
        const parsed = parseFloat(input.value);
        if (!Number.isNaN(parsed)) {
          updates.bayesWeight = parsed;
        }
      } else if (field === 'apiKey') {
        updates.apiKey = input.value || undefined;
      } else {
        updates[field] = input.value;
      }
    });

    const layout = selection.layoutNode;
    const providerKey = layout.providerId ?? layout.id;
    const hasConfig = Boolean(selection.config);

    try {
      this.showStatusMessage('Saving changes…');
      if (hasConfig) {
        await this.apiUpdateProvider(providerKey, updates);
      } else {
        if (!updates.baseURL) {
          this.showStatusMessage('Base URL is required to create a provider', 'error');
          return;
        }
        await this.apiCreateProvider({
          provider: providerKey,
          baseURL: updates.baseURL,
          apiKey: updates.apiKey,
          enabled: updates.enabled ?? true
        });
      }
      this.showStatusMessage('Changes saved successfully', 'success');
      await this.loadProviders();
      this.refreshTree();
      this.primarySelectionKey = `provider-${providerKey}`;
      this.renderDetailView();
    } catch (error) {
      console.error('Error saving provider changes', error);
      this.showStatusMessage(`Error saving changes: ${(error && error.message) || error}`, 'error');
    } finally {
      this.exitEditMode();
    }
  }

  async deleteSelection() {
    const selection = this.getSelectionItem();
    if (!selection || selection.type !== 'provider') {
      return;
    }
    if (!selection.config) {
      this.showStatusMessage('No provider configuration to delete', 'info');
      return;
    }

    const providerKey = selection.layoutNode.providerId ?? selection.layoutNode.id;
    const confirmed = window.confirm(`Delete provider configuration for "${selection.layoutNode.label}"?`);
    if (!confirmed) {
      return;
    }

    try {
      this.showStatusMessage('Deleting provider…');
      await this.apiDeleteProvider(providerKey);
      this.showStatusMessage('Provider deleted', 'success');
      await this.loadProviders();
      this.refreshTree();
      this.clearSelection();
    } catch (error) {
      console.error('Error deleting provider', error);
      this.showStatusMessage(`Error deleting provider: ${(error && error.message) || error}`, 'error');
    }
  }

  focusSearch() {
    if (!this.searchInput) {
      return;
    }
    this.searchInput.focus();
    this.searchInput.select();
  }

  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.searchTerm = '';
    this.refreshTree();
  }

  updateStatusBar() {
    if (!this.statusCount || !this.statusLastUpdated) {
      return;
    }

    const configured = this.providers.length;
    const total = this.totalProviderCount || configured;
    const visible = this.visibleProviderCount;

    const base = this.searchTerm
      ? `${visible}/${total} matches`
      : `${configured}/${total} providers configured`;
    const selected = this.selectedKeys.size ? ` • ${this.selectedKeys.size} selected` : '';

    this.statusCount.textContent = `${base}${selected}`;
    this.statusLastUpdated.textContent = new Date().toLocaleTimeString();
  }

  showStatusMessage(message, type = 'info') {
    if (!this.statusMessage) {
      return;
    }
    this.statusMessage.textContent = message;
    this.statusMessage.className = type;

    if (type === 'info' || type === 'success') {
      window.setTimeout(() => {
        if (this.statusMessage.textContent === message) {
          this.statusMessage.textContent = 'Ready';
          this.statusMessage.className = '';
        }
      }, 3000);
    }
  }

  async refresh() {
    await this.loadProviders();
    this.refreshTree();
  }

  async apiListProviders() {
    const response = await fetch(`${this.apiBase}/auth/providers`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to list providers');
    }
    return data.providers;
  }

  async apiUpdateProvider(providerKey, updates) {
    const response = await fetch(`${this.apiBase}/auth/providers/${providerKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to update provider');
    }
    return data.ok;
  }

  async apiCreateProvider(payload) {
    const response = await fetch(`${this.apiBase}/auth/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to create provider');
    }
    return data.ok;
  }

  async apiDeleteProvider(providerKey) {
    const response = await fetch(`${this.apiBase}/auth/providers/${providerKey}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to delete provider');
    }
    return data.ok;
  }

  async addProvider() {
    const provider = this.providerSelect?.value || '';
    const baseURL = this.baseUrlInput?.value || '';
    const apiKey = this.apiKeyInput?.value || '';
    const enabled = this.enabledCheckbox?.checked ?? true;

    if (!provider || !baseURL) {
      this.showStatusMessage('Provider and Base URL are required', 'error');
      return;
    }

    try {
      this.showStatusMessage('Adding provider…');
      if (this.modalSaveBtn) {
        this.modalSaveBtn.disabled = true;
        this.modalSaveBtn.textContent = 'Adding…';
      }

      const response = await fetch(`${this.apiBase}/auth/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, baseURL, apiKey, enabled })
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to add provider');
      }

      this.showStatusMessage('Provider added', 'success');
      this.hideAddProviderModal();
      await this.loadProviders();
      this.refreshTree();
    } catch (error) {
      console.error('Error adding provider', error);
      this.showStatusMessage(`Error adding provider: ${(error && error.message) || error}`, 'error');
    } finally {
      if (this.modalSaveBtn) {
        this.modalSaveBtn.disabled = false;
        this.modalSaveBtn.textContent = 'Add Provider';
      }
    }
  }

  showAddProviderModal() {
    if (!this.addProviderModal) {
      return;
    }

    const availableProviders = this.layout
      .flatMap((node) => (node.kind === 'group' ? node.children ?? [] : []))
      .filter((node) => node.kind === 'provider');

    if (this.providerSelect) {
      this.providerSelect.innerHTML = '<option value="">Select provider…</option>';
      availableProviders.forEach((node) => {
        const option = document.createElement('option');
        option.value = node.providerId ?? node.id;
        option.textContent = node.label;
        this.providerSelect.appendChild(option);
      });
    }

    this.addProviderForm?.reset();
    if (this.enabledCheckbox) {
      this.enabledCheckbox.checked = true;
    }
    this.addProviderModal.classList.add('show');
    this.baseUrlInput?.focus();
  }

  hideAddProviderModal() {
    this.addProviderModal?.classList.remove('show');
  }

  getProviderIcon(provider) {
    const icons = {
      OPENAI: '🤖',
      ANTHROPIC: '🧠',
      GOOGLE: '🔍',
      'GOOGLE-VERTEX': '🛠',
      GROQ: '⚡',
      FIREWORKS: '🎆',
      TOGETHER: '👥',
      OPENROUTER: '🛣️',
      DEEPSEEK: '🔭',
      VOYAGE: '🚢',
      COHERE: '🔗',
      REPLICATE: '🔄',
      HUGGINGFACE: '🤗'
    };
    const key = String(provider || '').toUpperCase();
    return icons[key] || '🔧';
  }

  countProviderNodes(nodes) {
    let count = 0;
    const stack = [...nodes];
    while (stack.length) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      if (node.kind === 'provider') {
        count += 1;
      }
      if (Array.isArray(node.children)) {
        stack.push(...node.children);
      }
    }
    return count;
  }

  isTypingInInput(target) {
    if (!target) {
      return false;
    }
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }
}

if (typeof window !== 'undefined') {
  window.AuthTreeManager = AuthTreeManager;
  const boot = () => {
    if (window.__AUTH_TREE_NO_AUTO_START__) {
      return;
    }
    window.authTreeManager = new AuthTreeManager();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}

export { AuthTreeManager };
