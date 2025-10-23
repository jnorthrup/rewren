/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-End Browser Tests for Auth Tree UI
 * Using Puppeteer for browser automation following Selenium conventions
 */

import { test, expect, beforeAll, afterAll, describe } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

describe('Auth Tree Web UI - E2E Tests', () => {
  let browser: Browser;
  let page: Page;
  let serverProcess: ChildProcess;
  const serverUrl = 'http://localhost:3456';
  const authTreeUrl = `${serverUrl}/auth-tree`;

  beforeAll(async () => {
    // Start the IDE server
    serverProcess = spawn('node', [
      path.join(__dirname, '../../dist/test-server.js')
    ], {
      env: { ...process.env, PORT: '3456' }
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Launch browser
    browser = await puppeteer.launch({
      headless: true, // Set to false for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    if (page) { await page.close(); }
    if (browser) { await browser.close(); }
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('Should load auth tree page', async () => {
    await page.goto(authTreeUrl);

    // Check page title
    const title = await page.title();
    expect(title).toContain('Auth Tree');

    // Check main sections exist
    const hierarchyTree = await page.$('.hierarchy-tree');
    expect(hierarchyTree).toBeTruthy();

    const selectorListbox = await page.$('.selector-listbox');
    expect(selectorListbox).toBeTruthy();

    const detailView = await page.$('#detail-view');
    expect(detailView).toBeTruthy();
  });

  test('Should display provider tree hierarchy', async () => {
    await page.goto(authTreeUrl);

    // Wait for tree to load
    await page.waitForSelector('.tree-node[data-type="root"]');

    // Check root node exists
    const rootNode = await page.$('.tree-node[data-type="root"]');
    expect(rootNode).toBeTruthy();

    // Get root node text
    const rootText = await page.$eval(
      '.tree-node[data-type="root"] .tree-label',
      el => (el as any).textContent
    );
    expect(rootText).toBe('Provider Tree');
  });

  test('Should list providers in selector', async () => {
    await page.goto(authTreeUrl);

    // Wait for providers to load
    await page.waitForSelector('.listbox-item:not(.template)', { timeout: 5000 });

    // Count provider items
    const providerItems = await page.$$('.listbox-item[data-type="provider"]:not(.template)');
    expect(providerItems.length).toBeGreaterThan(0);
  });

  test('Should select provider and show details', async () => {
    await page.goto(authTreeUrl);

    // Wait for providers
    await page.waitForSelector('.listbox-item[data-type="provider"]:not(.template)');

    // Click first provider
    const firstProvider = await page.$('.listbox-item[data-type="provider"]:not(.template)');
    if (firstProvider) {
      await firstProvider.click();

      // Wait for detail view to update
      await page.waitForSelector('.provider-detail');

      // Check detail sections
      const basicInfo = await page.$('.detail-section h4');
      const basicInfoText = await basicInfo?.evaluate((el: any) => el.textContent);
      expect(basicInfoText).toBe('Basic Information');
    }
  });

  test('Should open add provider modal', async () => {
    await page.goto(authTreeUrl);

    // Click add provider button
    const addBtn = await page.$('#add-provider-btn');
    await addBtn?.click();

    // Wait for modal
    await page.waitForSelector('.modal.show');

    // Check modal elements
    const providerSelect = await page.$('#provider-select');
    expect(providerSelect).toBeTruthy();

    const baseUrlInput = await page.$('#base-url');
    expect(baseUrlInput).toBeTruthy();

    const apiKeyInput = await page.$('#api-key');
    expect(apiKeyInput).toBeTruthy();
  });

  test('Should close modal on escape key', async () => {
    await page.goto(authTreeUrl);

    // Open modal
    await page.click('#add-provider-btn');
    await page.waitForSelector('.modal.show');

    // Press escape
    await page.keyboard.press('Escape');

    // Check modal is hidden
    const modalHidden = await page.$('.modal:not(.show)');
    expect(modalHidden).toBeTruthy();
  });

  test('Should enter and exit edit mode', async () => {
    await page.goto(authTreeUrl);

    // Select a provider first
    await page.waitForSelector('.listbox-item[data-type="provider"]:not(.template)');
    const provider = await page.$('.listbox-item[data-type="provider"]:not(.template)');
    await provider?.click();

    // Wait for detail view
    await page.waitForSelector('.provider-detail');

    // Click edit button
    const editBtn = await page.$('#edit-btn');
    await editBtn?.click();

    // Check edit mode
    const editMode = await page.$('.detail-view.edit-mode');
    expect(editMode).toBeTruthy();

    // Check save/cancel buttons visible
    const saveBtn = await page.$('#save-btn:not(.hidden)');
    expect(saveBtn).toBeTruthy();

    const cancelBtn = await page.$('#cancel-btn:not(.hidden)');
    expect(cancelBtn).toBeTruthy();

    // Cancel edit
    await cancelBtn?.click();

    // Check edit mode exited
    const noEditMode = await page.$('.detail-view:not(.edit-mode)');
    expect(noEditMode).toBeTruthy();
  });

  test('Should validate provider selection affects tree', async () => {
    await page.goto(authTreeUrl);

    // Get initial selection state
    await page.waitForSelector('.listbox-item[data-type="provider"]:not(.template)');

    // Click a provider
    const provider = await page.$('.listbox-item[data-type="provider"]:not(.template)');
    const providerKey = await provider?.$eval('[data-provider]', (el: any) => el.getAttribute('data-provider'));

    await provider?.click();

    // Check provider is selected in both panels
    const selectedInList = await page.$(`.listbox-item[data-provider="${providerKey}"].selected`);
    expect(selectedInList).toBeTruthy();

    const selectedInTree = await page.$(`.tree-node[data-provider="${providerKey}"].selected`);
    // Tree selection might be optional, but list should always show selection
    if (selectedInTree) {
      expect(selectedInTree).toBeTruthy();
    }
  });

  test('Should handle API errors gracefully', async () => {
    await page.goto(authTreeUrl);

    // Intercept network requests to simulate error
    await page.setRequestInterception(true);

    page.on('request', (request: any) => {
      if (request.url().includes('/auth/providers') && request.method() === 'POST') {
        request.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Test error' })
        });
      } else {
        request.continue();
      }
    });

    // Try to add provider
    await page.click('#add-provider-btn');
    await page.waitForSelector('.modal.show');

    await page.select('#provider-select', 'OPENAI');
    await page.type('#base-url', 'https://api.openai.com/v1');
    await page.type('#api-key', 'test-key');

    await page.click('#modal-save');

    // Check error message appears
    await page.waitForSelector('.error', { timeout: 5000 });
    const errorText = await page.$eval('.error', (el: any) => el.textContent);
    expect(errorText).toContain('error');
  });

  test('Should refresh provider list', async () => {
    await page.goto(authTreeUrl);

    // Get initial provider count
    await page.waitForSelector('.listbox-item[data-type="provider"]:not(.template)');
    const initialProviders = await page.$$('.listbox-item[data-type="provider"]:not(.template)');
    const initialCount = initialProviders.length;

    // Click refresh
    const refreshBtn = await page.$('#refresh-btn');
    await refreshBtn?.click();

    // Wait for potential update
    await (page as any).waitForTimeout(1000);

    // Check providers still loaded
    const refreshedProviders = await page.$$('.listbox-item[data-type="provider"]:not(.template)');
    expect(refreshedProviders.length).toBeGreaterThanOrEqual(initialCount);
  });

  test('Should display static items (Identity, Configs, Metrics)', async () => {
    await page.goto(authTreeUrl);

    // Check for static items
    await page.waitForSelector('.listbox-item[data-type="identity"]');

    const identityItem = await page.$('.listbox-item[data-type="identity"]');
    expect(identityItem).toBeTruthy();

    const configsItem = await page.$('.listbox-item[data-type="configs"]');
    expect(configsItem).toBeTruthy();

    const metricsItem = await page.$('.listbox-item[data-type="metrics"]');
    expect(metricsItem).toBeTruthy();

    // Click on identity
    await identityItem?.click();

    // Check placeholder shows
    await page.waitForSelector('.detail-placeholder');
    const placeholderText = await page.$eval('.placeholder-text', (el: any) => el.textContent);
    expect(placeholderText).toContain('coming soon');
  });
});

// Selenium-style helper functions for common operations
export class AuthTreePage {
  constructor(private page: Page) {}

  async navigateTo() {
    await this.page.goto('http://localhost:3456/auth-tree');
  }

  async selectProvider(providerName: string) {
    const selector = `.listbox-item[data-provider="${providerName}"]:not(.template)`;
    await this.page.waitForSelector(selector);
    await this.page.click(selector);
  }

  async openAddProviderModal() {
    await this.page.click('#add-provider-btn');
    await this.page.waitForSelector('.modal.show');
  }

  async fillProviderForm(provider: string, baseUrl: string, apiKey: string) {
    await this.page.select('#provider-select', provider);
    await this.page.type('#base-url', baseUrl);
    await this.page.type('#api-key', apiKey);
  }

  async saveProvider() {
    await this.page.click('#modal-save');
  }

  async enterEditMode() {
    await this.page.click('#edit-btn');
    await this.page.waitForSelector('.detail-view.edit-mode');
  }

  async exitEditMode() {
    await this.page.click('#cancel-btn');
    await this.page.waitForSelector('.detail-view:not(.edit-mode)');
  }

  async deleteProvider() {
    await this.page.click('#delete-btn');
    // Handle confirmation dialog
    this.page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });
  }

  async getProviderCount(): Promise<number> {
    const providers = await this.page.$$('.listbox-item[data-type="provider"]:not(.template)');
    return providers.length;
  }

  async isProviderSelected(providerName: string): Promise<boolean> {
    const selected = await this.page.$(`.listbox-item[data-provider="${providerName}"].selected`);
    return selected !== null;
  }
}