# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
# Build
cargo build                    # Debug build
cargo build --release          # Release build

# Run
cargo run                      # Default: starts TUI
cargo run -- tui               # Explicit TUI mode
cargo run -- ingest <PATH>     # Ingest document via memvid
cargo run -- init-config       # Initialize default config
cargo run -- show-config       # Display current config

# Testing
cargo test                     # Run all tests
cargo test --lib               # Run library tests only
cargo check                    # Fast syntax/type check
cargo clippy                   # Linting
```

## Architecture Overview

wren3 is an LLM provider orchestration system with three core layers:

### 1. Data Pipeline: CouchDB + memvid + PyO3
- **PyO3 Bridge** (`src/memvid.rs`): Synchronous wrapper around Python memvid algorithms in `python/memvid_entropic_bridge.py`
- **CouchDB Client** (`src/couchdb/`): Document storage with MapReduce views for cognitive_load and compression_ratio indices
- **Query Pipeline** (`src/query_pipeline.rs`): Orchestrates view queries → cosine similarity ranking → LLM context assembly

### 2. Query Processing Flow
1. User query → OpenAI embedding (if configured) or fallback to cognitive_load ranking
2. CouchDB MapReduce views emit (cognitive_load, {id, chunk_id, vector, content})
3. Cosine similarity computed in Rust against all view results
4. Top-k chunks assembled into LLM context respecting token budget (char/4 heuristic)
5. Context sent to OpenAI or returned directly if no API key

**Key behavior**: `query_similar_chunks` always fetches ALL view rows (no limit parameter to CouchDB), then filters/sorts/truncates in Rust. This ensures high-similarity chunks are found even if cognitive_load ordering would place them outside a naive limit window.

### 3. Configuration System
- Search order: `./wren3.toml` → `./wren3.yaml` → `./config/wren3.{toml,yaml}` → `~/wren3.{toml,yaml}` → `~/.config/wren3.{toml,yaml}`
- Environment variables override config file: `WREN3_DATABASE_URL`, `WREN3_DATABASE_NAME`, `OPENAI_API_KEY`, `WREN3_LOG_LEVEL`
- `Config::default()` sets empty `api_key` to keep OpenAI disabled until explicitly configured (see comment in `src/config.rs:67-72`)

## CouchDB View JavaScript Constraints

The MapReduce views in `query_pipeline.rs` use ES5-compatible JavaScript (no `Array.find`, `let`, arrow functions). CouchDB's view engine may not support modern ES6+ syntax. Views iterate chunks manually with `for` loops and match by `chunk.id === chunk_id`.

## Testing Infrastructure

- **Stub Server**: `src/couchdb_stub.rs` + `TestCouchStub` for integration tests (uses axum + mockito)
- **QA Framework**: `src/test_framework.rs` supports tmux screenshot capture for TUI testing
- Run integration tests with stub: tests spawn ephemeral HTTP server, no external CouchDB needed
- Run single test: `cargo test test_name`

## Token Budget Behavior

Both `build_llm_context` and `build_context_without_embeddings` use `assemble_context_from_query_results` which:
- Skips individual chunks exceeding `max_tokens` (continues to next chunk rather than aborting)
- Respects `max_chunks` limit
- Uses `content.len() / 4` as token estimation heuristic

If no chunks fit the budget, returns "No relevant context found for the query." and skips OpenAI API call entirely.

## Module Reorganization Notes

`src/couchdb.rs` is a facade re-exporting from `src/couchdb/*.rs`. Actual implementation split across:
- `src/couchdb/client.rs`: CouchDBClient methods
- `src/couchdb/config.rs`: CouchDbConfig
- `src/couchdb/models.rs`: MemvidDocument, MemvidChunk, ChunkVectors
- `src/couchdb/tests.rs`: Integration tests

## Python Integration

- `pyo3::prepare_freethreaded_python()` called in main.rs
- MemvidBridge expects `python/memvid_entropic_bridge.py` with `MemvidEntropicBridge` class
- PyO3 GIL is acquired per operation (no persistent interpreter state in Rust structs)
