2# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wren3 is an LLM provider orchestration system with memvid-based content storage, QA-centric TUI, and CouchDB persistence. Architecture: Rust main process with PyO3 sync wrapper around Python memvid algorithms.

## Core Architecture

```
Rust (wren3)
├── TUI (ratatui + QA framework)
├── LLM orchestration (reqwest)
├── CouchDB client (couch_rs or reqwest)
└── memvid bridge (PyO3 sync wrapper)
      ↓
    Python memvid (~/work/tika4all/memvid*.py)
      ↓
    CouchDB (local/remote)
```

### Language Boundaries

- **Rust**: I/O multiplexing, TUI, HTTP clients, CouchDB interface, async runtime (tokio)
- **Python**: CPU-bound memvid algorithms (compression, vector extraction, chunking)
- **PyO3 Interface**: Sync calls only - no async bridge (avoids 55% stall risk from GIL/tokio impedance mismatch)

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
- Existing memvid code at `~/work/tika4all/memvid_entropic_bridge.py`
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

## Key Constraints

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

### What NOT to Build
- ❌ Do not port memvid to Rust (15% algorithm failure risk)
- ❌ Do not use PyO3 async bridge (55% stall risk documented)
- ❌ Do not fork literbike - extract patterns only
- ❌ Do not add IPFS/QUIC/M2M/tensor ops for MVP
- ❌ Do not implement Harmony format without clear specification
- ❌ Do not create custom blob store - use CouchDB attachments

### Deferred to v2
- Harmony streaming format
- IPFS integration
- Custom Rust view server for vector similarity
- Sled backend option
- Advanced literbike features
- FFmpeg integration (if video processing needed)

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

1. PyO3 wrapper + CouchDB client
2. Core pipeline (ingest → memvid → store → query)
3. TUI + QA framework
4. Polish + local model support

## Critical Path Items

1. **CouchDB view validation** - Prototype vector query to validate JS map/reduce sufficient
2. **memvid chunk sizes** - Inspect Python code to determine inline vs attachment strategy
3. **tmux integration** - Research complexity before committing to approach

## Related Codebases

- `~/work/tika4all/memvid_entropic_bridge.py` - Main memvid algorithms (~300 LOC)
- `~/work/tika4all/lcel_memvid_rag.py` - LangChain integration (~545 LOC, not required for MVP)
- `../literbike` - Rust proxy with CouchDB emulator, reference for storage patterns
