2# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wren3 is an LLM provider orchestration system with memvid-based content storage, QA-centric TUI, and CouchDB persistence. Architecture: Rust main process with native memvid algorithms, TUI, HTTP clients, CouchDB interface, and async runtime (tokio).

## Core Architecture

```
Rust (wren3)
├── TUI (ratatui + QA framework)
├── LLM orchestration (reqwest)
├── CouchDB client (couch_rs or reqwest)
├── Native memvid algorithms (compression, chunking, vector extraction)
└── PyO3 bridge (legacy Python compatibility)
      ↓
    Python memvid (python/memvid_entropic_bridge.py)
      ↓
    CouchDB (local/remote)
```

### Language Boundaries

- **Rust**: I/O multiplexing, TUI, HTTP clients, CouchDB interface, async runtime (tokio), native memvid algorithms
- **Python**: Legacy memvid implementation (kept for compatibility)
- **PyO3 Interface**: Available for Python extensions but not required for core functionality

### Storage Model

CouchDB documents with inline chunks + vectors:

```json
{
  "_id": "uuid",
  "_attachments": {
    "chunk_0": {"data": "base64_or_stub"}
  },
  "vectors": {
    "chunk_0": [0.1, 0.2, ..., 1.0]
  },
  "metadata": {
    "cognitive_load": 0.73,
    "compression_ratio": 0.42,
    "taxonomical_depth": 3
  }
}
```

CouchDB views use JavaScript map/reduce for vector queries. Custom Rust view server deferred to v2.

## Dependencies

### Rust Crates

- `pyo3 = "0.22"` - Python FFI (sync calls only)
- `couch_rs = "0.9"` or `reqwest` for CouchDB HTTP
- `ratatui = "0.29"` - TUI framework
- `crossterm = "0.28"` - Terminal control
- `tokio = "1.41"` - Async runtime

### Python Dependencies

- Existing memvid code at `python/memvid_entropic_bridge.py`
- No LangChain required for MVP
- Standard library for compression (gzip), hashing (hashlib)

### External Resources

- `../literbike` - Rust proxy with CouchDB emulator (Sled-based). Reference for patterns but do not fork entire codebase.

## Build Commands

```bash
# Standard Rust build
cargo build

# Run with Python environment
cargo run

# Tests
cargo test

# Run specific test
cargo test test_name

# Check without building
cargo check
```

### Key Constraints

### PyO3 Integration Rules

1. **Use sync calls only** - Call Python from Rust threads, not from async contexts
2. **GIL management** - Use `Python::with_gil()` for all Python interactions
3. **Example pattern**:

   ```rust
   fn process_text(text: &str) -> Result<MemvidResult> {
       Python::with_gil(|py| {
           let memvid = py.import("memvid_entropic_bridge")?;
           let result = memvid.call_method1("process_document", (text,))?;
           // Extract into Rust structs
           Ok(result.extract()?)
       })
   }
   ```

Memvid has been ported to native Rust for performance and integration benefits, incorporating FFmpeg for advanced video processing capabilities. The PyO3 bridge remains available for any Python-based extensions or legacy compatibility.

- ❌ Do not fork literbike - extract patterns only
- ❌ Do not add IPFS/QUIC/M2M/tensor ops for MVP
- ❌ Do not implement Harmony format without clear specification
- ❌ Do not create custom blob store - use CouchDB attachments
- ❌ Do NOT call, integrate, or depend on external hosted services or third-party SaaS ("outside services") directly from repository code without explicit written approval from the project owner. All external integrations must be:
  - configurable (not hard-coded), and
  - abstracted behind provider interfaces so they can be stubbed or mocked in tests, and
  - exercised in CI only via test doubles or test accounts provisioned and approved by the project owner.
  This rule covers hosted LLM APIs, external telemetry/analytics services, and any third-party SaaS. The intent is to keep development reproducible, auditable, and to avoid accidental data exfiltration.

### Deferred to v2

- Harmony streaming format
- IPFS integration
- Custom Rust view server for vector similarity
- Sled backend option
- Advanced literbike features

## QA Framework

TUI must include self-testing capabilities:

- Test mode toggle in interface
- tmux screenshot capture via control mode
- Reproducible test cases: input → process → query → verify → screenshot
- Test report generation

### tmux Integration

- Use tmux control mode for screenshot capture
- Research existing Rust tmux crates
- Unknown complexity

## CouchDB Query Pattern

1. Create view (JavaScript):

   ```javascript
   function(doc) {
     if (doc.vectors) {
       for (var chunk_id in doc.vectors) {
         emit(doc.metadata.cognitive_load, {
           id: doc._id,
           chunk: chunk_id,
           vector: doc.vectors[chunk_id]
         });
       }
     }
   }
   ```

2. Query from Rust:

   ```rust
   let results = client.query_view("memvid/by_cognitive_load")
       .start_key(min_load)
       .end_key(max_load)
       .execute().await?;
   ```

3. Rank results client-side (cosine similarity in Rust for MVP)

## LLM Provider Integration

- OpenAI API: reqwest + serde JSON
- Local models: llama.cpp HTTP API (same interface pattern)
- No streaming complexity for MVP - simple request/response

## Implementation Phases

1. ✅ **PyO3 wrapper + CouchDB client** - Native Rust memvid + CouchDB client complete
2. ✅ **Core pipeline (ingest → memvid → store → query)** - Basic pipeline working with FFmpeg video metadata support
3. ✅ **TUI + QA framework** - TUI implemented with offline mode support, QA framework needs tmux control mode
4. 🔄 **Polish + local model support** - Performance optimization and additional LLM providers

## Critical Path Items

1. ✅ **CouchDB view validation** - Prototype vector query validated; JS map/reduce sufficient for MVP with client-side similarity calculation
2. ✅ **memvid chunk sizes** - Inspected Python code; ~1000 char chunks, inline storage appropriate for CouchDB
3. ✅ **FFmpeg integration** - Video metadata extraction implemented using ffprobe command-line tool
4. 🔄 **tmux integration** - Basic implementation complete using tmux commands; control mode deferred to v2

## Related Codebases

- `src/memvid.rs` - Main memvid algorithms (native Rust implementation, ~300 LOC)
- `python/memvid_entropic_bridge.py` - Legacy Python memvid implementation (kept for compatibility)
- `~/work/tika4all/lcel_memvid_rag.py` - LangChain integration (~545 LOC, not required for MVP)
- `../literbike` - Rust proxy with CouchDB emulator, reference for storage patterns
