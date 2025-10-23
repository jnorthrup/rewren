/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import {
  AuthType,
  ContentGeneratorConfig,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { MemoryTool, setMdFilename, CONFIG_DIR } from '../tools/memoryTool.js';
import { VerificationTool } from '../tools/verification.js';
import { GeminiClient } from '../core/client.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { loadServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import { getProjectTempDir } from '../utils/paths.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
  StartSessionEvent,
} from '../telemetry/index.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';
import { ApiKeyService } from '../services/apiKeyService.js';
import { QuotaService } from '../services/quotaService.js';
import { SessionService } from '../services/sessionService.js';

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_THINKING_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const DEFAULT_TOKEN_LIMIT = 128_000;

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  logPrompts?: boolean;
}

export interface ActiveExtension {
  name: string;
  version: string;
}

export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
  ) {}
}

export interface SandboxConfig {
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<boolean | string | null>;

export interface ConfigParameters {
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  rewrenMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  bugCommand?: BugCommandSettings;
  model: string;
  extensionContextFilePaths?: string[];
  maxSessionTurns?: number;
  listExtensions?: boolean;
  activeExtensions?: ActiveExtension[];
  noBrowser?: boolean;
  ideMode?: boolean;
  enableOpenAILogging?: boolean;
  sampling_params?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
  // Enable DORA recommendations and optionally override individual capability flags.
  dora?: {
    enabled?: boolean;
    capabilities?: Partial<Record<string, boolean>>;
  };
}

export enum DoraCapability {
  VERSION_CONTROL = 'versionControl',
  SMALL_STEPS = 'smallSteps',
  USER_CENTRIC = 'userCentric',
  INTERNAL_PLATFORMS = 'internalPlatforms',
  SPEC_AND_VERIFICATION = 'specAndVerification',
  DATA_MANAGEMENT = 'dataManagement',
  SUPERVISE_JUNIORS = 'superviseJuniors',
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private readonly sessionId: string;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private rewrenMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    enableRecursiveFileSearch: boolean;
  };
  private doraEnabled: boolean = false;
  private doraCapabilities: Record<DoraCapability, boolean> = {
    [DoraCapability.VERSION_CONTROL]: true,
    [DoraCapability.SMALL_STEPS]: true,
    [DoraCapability.USER_CENTRIC]: true,
    [DoraCapability.INTERNAL_PLATFORMS]: true,
    [DoraCapability.SPEC_AND_VERIFICATION]: true,
    [DoraCapability.DATA_MANAGEMENT]: true,
    [DoraCapability.SUPERVISE_JUNIORS]: true,
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly model: string;
  private readonly extensionContextFilePaths: string[];
  private readonly noBrowser: boolean;
  private readonly ideMode: boolean;
  private readonly enableOpenAILogging: boolean;
  private readonly sampling_params?: {
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    temperature?: number;
    max_tokens?: number;
  };
  private modelSwitchedDuringSession: boolean = false;
  private resumeModel?: string;
  private readonly maxSessionTurns: number;
  private readonly listExtensions: boolean;
  private readonly _activeExtensions: ActiveExtension[];
  flashFallbackHandler?: FlashFallbackHandler;
  private quotaErrorOccurred: boolean = false;
  private apiKeyService: ApiKeyService | undefined;
  private quotaService: QuotaService | undefined;

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel = params.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.rewrenMdFileCount = params.rewrenMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      logPrompts: params.telemetry?.logPrompts ?? true,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
    };
    // DORA recommendations (non-invasive defaults). If the caller provides overrides
    // they will be merged in. Enabling DORA will cause applyDoraRecommendations()
    // to be invoked during initialize().
    this.doraEnabled = params.dora?.enabled ?? false;
    if (params.dora?.capabilities) {
      for (const key of Object.keys(params.dora.capabilities)) {
        if (key in this.doraCapabilities) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - index by string key validated above
          this.doraCapabilities[key as DoraCapability] =
            params.dora!.capabilities![key as keyof typeof params.dora.capabilities] ?? this.doraCapabilities[key as DoraCapability];
        }
      }
    }
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.listExtensions = params.listExtensions ?? false;
    this._activeExtensions = params.activeExtensions ?? [];
    this.noBrowser = params.noBrowser ?? false;
    this.ideMode = params.ideMode ?? false;
    this.enableOpenAILogging = params.enableOpenAILogging ?? false;
    this.sampling_params = params.sampling_params;

    if (params.contextFileName) {
      setMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }

    if (this.getUsageStatisticsEnabled()) {
      ClearcutLogger.getInstance(this)?.logStartSessionEvent(
        new StartSessionEvent(this),
      );
    } else {
      console.log('Data collection is disabled.');
    }
  }

  async initialize(): Promise<void> {
    // Initialize centralized FileDiscoveryService
    this.getFileService();
    // Try to load last session snapshot (best-effort resume)
    try {
      const snapshot = SessionService.load();
      if (snapshot && snapshot.model) {
        // Store resume model and switched flag; apply later when content generator is created
        this.resumeModel = snapshot.model;
        this.modelSwitchedDuringSession = snapshot.modelSwitchedDuringSession ?? this.modelSwitchedDuringSession;
      }
    } catch (_e) {
      // best-effort
    }
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    // If DORA recommendations are enabled, apply a small set of safe, opt-in
    // adjustments (best-effort) that encourage version-control and small-step
    // practices. These are intentionally minimal and reversible via config.
    if (this.doraEnabled) {
      this.applyDoraRecommendations();
    }
    this.toolRegistry = await this.createToolRegistry();
    
    // Initialize API key and quota services
    this.apiKeyService = new ApiKeyService();
    this.quotaService = new QuotaService(this.apiKeyService);

    // Save session snapshot on exit so we can resume later
    const saveSnapshot = () => {
      try {
        const snapshot = SessionService.buildSnapshot(this.getSessionId(), this.getModel(), this.modelSwitchedDuringSession);
        SessionService.save(snapshot);
      } catch (_e) {
        // best-effort
      }
    };

    process.on('exit', saveSnapshot);
    process.on('SIGINT', () => { saveSnapshot(); process.exit(0); });
    process.on('SIGTERM', () => { saveSnapshot(); process.exit(0); });
  }

  async refreshAuth(authMethod: AuthType) {
    // Preserve the currently selected model if user has changed it during the session
    const currentModel = this.contentGeneratorConfig?.model || this.model;
    const preserveModel = this.modelSwitchedDuringSession;

    console.log(`[Config.refreshAuth] Called with authMethod=${authMethod}`);
    console.log(`[Config.refreshAuth] Current model: ${currentModel}, preserveModel: ${preserveModel}, this.model: ${this.model}`);

    this.contentGeneratorConfig = await createContentGeneratorConfig(
      this.model,
      authMethod,
    );
    this.contentGeneratorConfig.enableOpenAILogging = this.enableOpenAILogging;

    // If we have a resume model from an earlier session, prefer it now
    if (this.resumeModel) {
      console.log(`[Config.refreshAuth] Applying resume model: ${this.resumeModel}`);
      this.contentGeneratorConfig.model = this.resumeModel;
      // Clear once applied
      this.resumeModel = undefined;
    } else if (preserveModel && currentModel !== this.model) {
      // Preserve user's model selection across auth refresh
      this.contentGeneratorConfig.model = currentModel;
      console.log(`[Config.refreshAuth] Preserving user-selected model: ${currentModel}`);
    } else {
      console.log(`[Config.refreshAuth] NOT preserving model (preserveModel=${preserveModel}, currentModel=${currentModel}, this.model=${this.model})`);
    }

    // Set sampling parameters from config if available
    if (this.sampling_params) {
      this.contentGeneratorConfig.samplingParams = this.sampling_params;
    }

    this.geminiClient = new GeminiClient(this);
    await this.geminiClient.initialize(this.contentGeneratorConfig);

    console.log(`[Config.refreshAuth] After refresh, model is now: ${this.contentGeneratorConfig.model}`);

    // Keep the session flag if we preserved the model
    if (!preserveModel) {
      this.modelSwitchedDuringSession = false;
      console.log(`[Config.refreshAuth] Reset modelSwitchedDuringSession to false`);
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.contentGeneratorConfig?.model || this.model;
  }

  setModel(newModel: string): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = newModel;
      this.modelSwitchedDuringSession = true;
      console.log(`[Config.setModel] Model changed to: ${newModel}, modelSwitchedDuringSession=${this.modelSwitchedDuringSession}`);
    } else {
      console.error(`[Config.setModel] Cannot set model - contentGeneratorConfig is not initialized`);
    }
  }

  /**
   * Reinitialize the content generator client with the currently selected model.
   * This closes old TCP connections and establishes new ones to the provider without resetting the model.
   * Works for any provider (OpenAI, Anthropic, xAI, etc.), not Gemini-specific.
   */
  async reinitializeClient(): Promise<void> {
    if (!this.contentGeneratorConfig) {
      console.error('[Config.reinitializeClient] Cannot reinitialize - contentGeneratorConfig not initialized');
      return;
    }

    const currentModel = this.contentGeneratorConfig.model;
    const currentAuthType = this.contentGeneratorConfig.authType;
    console.log(`[Config.reinitializeClient] Reinitializing client with model: ${currentModel}, authType: ${currentAuthType}`);

    // Reinitialize the GeminiClient (which handles all providers via content generators)
    // The client will create the appropriate content generator for the model's provider
    this.geminiClient = new GeminiClient(this);
    await this.geminiClient.initialize(this.contentGeneratorConfig);

    console.log(`[Config.reinitializeClient] Client reinitialized for provider, model is: ${this.contentGeneratorConfig.model}`);
  }

  isModelSwitchedDuringSession(): boolean {
    return this.modelSwitchedDuringSession;
  }

  resetModelToDefault(): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = this.model; // Reset to the original default model
      this.modelSwitchedDuringSession = false;
    }
  }

  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  getApiKeyService(): ApiKeyService {
    if (!this.apiKeyService) {
      this.apiKeyService = new ApiKeyService();
    }
    return this.apiKeyService;
  }

  getQuotaService(): QuotaService {
    if (!this.quotaService) {
      const apiKeyService = this.getApiKeyService();
      this.quotaService = new QuotaService(apiKeyService);
    }
    return this.quotaService;
  }

  async getUserTier(): Promise<UserTierId | undefined> {
    if (!this.geminiClient) {
      return undefined;
    }
    const generator = this.geminiClient.getContentGenerator();
    return await generator.getTier?.();
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getToolRegistry(): Promise<ToolRegistry> {
    return Promise.resolve(this.toolRegistry);
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getMdFileCount(): number {
    return this.rewrenMdFileCount;
  }

  setMdFileCount(count: number): void {
    this.rewrenMdFileCount = count;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, CONFIG_DIR);
  }

  getProjectTempDir(): string {
    return getProjectTempDir(this.getProjectRoot());
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getActiveExtensions(): ActiveExtension[] {
    return this._activeExtensions;
  }

  getNoBrowser(): boolean {
    return this.noBrowser;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      await this.gitService.initialize();
    }
    return this.gitService;
  }

  getEnableOpenAILogging(): boolean {
    return this.enableOpenAILogging;
  }

  async refreshMemory(): Promise<{ memoryContent: string; fileCount: number }> {
    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      this.getWorkingDir(),
      this.getDebugMode(),
      this.getFileService(),
      this.getExtensionContextFilePaths(),
    );

    this.setUserMemory(memoryContent);
    this.setMdFileCount(fileCount);

    return { memoryContent, fileCount };
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this);

    // helper to create & register core tools that are enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
      const coreTools = this.getCoreTools();
      const excludeTools = this.getExcludeTools();

      let isEnabled = false;
      if (coreTools === undefined) {
        isEnabled = true;
      } else {
        isEnabled = coreTools.some(
          (tool) =>
            tool === className ||
            tool === toolName ||
            tool.startsWith(`${className}(`) ||
            tool.startsWith(`${toolName}(`),
        );
      }

      if (
        excludeTools?.includes(className) ||
        excludeTools?.includes(toolName)
      ) {
        isEnabled = false;
      }

      if (isEnabled) {
        registry.registerTool(new ToolClass(...args));
      }
    };

    registerCoreTool(LSTool, this);
    registerCoreTool(ReadFileTool, this);
    registerCoreTool(GrepTool, this);
    registerCoreTool(GlobTool, this);
    registerCoreTool(EditTool, this);
    registerCoreTool(WriteFileTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(ReadManyFilesTool, this);
    registerCoreTool(ShellTool, this);
    registerCoreTool(MemoryTool);
    registerCoreTool(VerificationTool, this);
    // registerCoreTool(WebSearchTool, this); // Temporarily disabled
    // Add the new web search tools
    // registerCoreTool(WebSearchTool, this); // Register the updated web search tool

    await registry.discoverTools();
    return registry;
  }

  /**
   * Apply a minimal, safe set of DORA recommendations to the runtime config.
   * This is intentionally conservative: it only flips a couple of flags that
   * help encourage version control and small-step development workflows.
   */
  private applyDoraRecommendations(): void {
    // If version control capability is recommended, enable checkpointing.
    if (this.doraCapabilities[DoraCapability.VERSION_CONTROL]) {
      // Only enable if not already explicitly disabled.
      // Note: checkpointing is a readonly field on the class, but the underlying
      // intent is to prefer enabling Git-backed checkpointing. We attempt to
      // initialize git service if checkpointing is true. Since checkpointing
      // may be readonly at the type-level, we flip behavior by ensuring that
      // getGitService() is primed when appropriate.
      // If checkpointing was false and we want to enable it, try to initialize
      // the GitService as a best-effort; this does not mutate the original
      // constructor param but makes the service available.
      this.getGitService().catch(() => {
        // best-effort; ignore errors
      });
    }

    // If data management / gitignore respect is recommended, ensure we
    // respect .gitignore when searching files.
    if (this.doraCapabilities[DoraCapability.DATA_MANAGEMENT]) {
      this.fileFiltering.respectGitIgnore = true;
    }

    // Small steps recommendation: encourage enabling recursive file search
    // to allow finer-grained operations. This is non-invasive: leave enabled
    // if already set.
    if (this.doraCapabilities[DoraCapability.SMALL_STEPS]) {
      this.fileFiltering.enableRecursiveFileSearch = true;
    }
  }

  getDoraEnabled(): boolean {
    return this.doraEnabled;
  }

  getDoraCapabilities(): Record<DoraCapability, boolean> {
    return { ...this.doraCapabilities };
  }
}
