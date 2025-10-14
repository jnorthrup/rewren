# Comprehensive TODO (merged)

This file consolidates the provider-tree TODOs plus additional issues discovered while auditing the codebase. Use this as a single source of truth for prioritization and work planning.

## High Priority — VS Code & Provider Integration

- [ ] Fix VSCode detection: use `VSCODE_IPC_HOOK_CLI` and extension activation checks instead of relying on `TERM_PROGRAM` or `VSCODE_PID` alone.
- [ ] Implement an actual VSCode LLM provider with PAT auth and a `vscode-llm` provider implementation file under `packages/core/src/config/providers/`.
- [ ] Wire VSCode provider models into the model registry and UI (copilot, gpt-4, Claude via VSCode if available).

## High Priority — Core provider & model routing

- [ ] Implement provider failover and health checks; set `hasApiKey` dynamically and prefer providers with healthy connections.
- [ ] Add quota enforcement and per-model rate limiting (use `QuotaNode` fields: daily/monthly limits, requestsPerMinute).
- [ ] Wire `bayesWeight` into model selection and routing logic; collect benchmark metrics for routing decisions.
- [ ] Implement model selection callbacks in the UI (activate model on Enter/Space) and favorites/pinning support.

## API format support & content generators

- [ ] Wire model format flags (NVIDIA/Harmony/Gemini) into the content generators so requests use the correct API format.
- [ ] Implement a Gemini native content generator and ensure `geminiFormat` models call the correct endpoints.
- [ ] Ensure OpenAI-compatible wrappers check provider-specific response flags (e.g., `nvidiaResponse`) before parsing.

## Provider implementations & exports

- [ ] Add missing provider implementation files for enums present in `providers.ts` (e.g., Amazon Bedrock, Azure, GitHub Copilot, Hugging Face, Llama, Morph, Vercel, xAI, Fireworks AI, GitHub Models, Inference, AI21 Labs, Core42, Nous Research, TNG Tech, Cognitive Computations, Cerebras, etc.).
- [ ] Ensure `packages/core/src/config/providers/index.ts` exports all provider modules and their model lists.

## Model discovery, registry, caching

- [ ] Implement dynamic model discovery caching to avoid re-fetching on every init; provide TTL and manual refresh.
- [ ] Add model filtering by capabilities (function-calling, streaming, vision) and validate `tokenLimit`/`contextWindow` before requests.
- [ ] Add model benchmarking to record latency/quality and surface it to routing logic.

## Provider Tree & UI fixes (tests failing)

- [ ] Fix `PanelNode` handling: panel should not be counted as a primary child in tests or else tests must be updated to expect it.
- [ ] Implement missing methods on tree nodes: `ModelsNode.loadModels`, `QuotaNode.incrementUsage`, `MetricsNode.recordSuccess/recordError`, and computed properties (quotaUsagePercent, estimatedDailyCost, successRate, avgLatencyMs).
- [ ] Fix incorrect node id/type assignments (ConfigNode vs PanelNode) and ensure `toJSON`/`fromJSON` behave as tests expect.
- [ ] Add tree initialization timing fixes so models load on first render; add unit tests for the timing behavior.

## Data management, import/export & migration

- [ ] Add import validation/schema checks for imported JSON models; support YAML/TOML exports in addition to JSON.
- [ ] Add atomic-save safeguards (optimistic locking or file locks) to prevent race conditions during rapid edits.
- [ ] Implement tree versioning and rollback (simple history snapshots) for provider/model config changes.

## Telemetry, metrics & cost tracking

- [ ] Fix telemetry logger Buffer.concat errors (clearcut-logger) causing test uncaught exceptions.
- [ ] Wire `QuotaNode.costPer1kTokens` into metrics and provide estimatedDailyCost calculations.
- [ ] Add real-time metrics UI and ensure `MetricsNode` updates on each request with latency and success/failure counts.

## Code quality & linting

- [ ] Address ~300 ESLint errors across the repo; prioritize missing license headers, no-explicit-any, unused vars, and rule violations blocking CI.
- [ ] Replace `T[]` with `Array<T>` where the ESLint rule requires it, and add proper types instead of `any` in `providerTreeNodes.ts` and related files.
- [ ] Remove forbidden `require()` usage from test files or convert to ESM imports.

## Tests & CI

- [ ] Fix failing provider tree unit tests (14 failing assertions) by implementing missing functionality and/or updating tests if behavior intentionally changed.
- [ ] Stabilize integration tests by fixing environment assumptions (global `fetch`, `process`, `console`, license headers, and test-specific require/import issues).
- [ ] Add unit tests for provider health checks, model discovery caching, and quota enforcement.

## Developer ergonomics & misc

- [ ] Add keyboard shortcut legend view in the UI.
- [ ] Add provider grouping options (Primary/Regional/Alternative) configurable via tree settings.
- [ ] Improve model name shortening/abbreviation (smart abbreviation vs naive truncation).

---

If you'd like, I can now:

- start by implementing the missing `ModelsNode.loadModels`, `QuotaNode.incrementUsage`, and `MetricsNode.recordSuccess/recordError` to get the provider tree tests passing (quick, high-impact), or
- scaffold the VSCode LLM provider and wire it into the registry and tree (more work, enables VS Code integration testing).

Which of the two would you like me to prioritize? Or should I produce a prioritized plan (short sprints) that sequences these fixes?
