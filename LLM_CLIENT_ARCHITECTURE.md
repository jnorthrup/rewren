# wren3 - LLM Provider Orchestration System with Mature LLM Client Integration

## Overview

wren3 implements a mature LLM client system with multiple provider support, including:
- OpenAI API integration
- Local LLM support (llama.cpp compatible)
- LLM orchestration and fan-out capabilities
- Vector storage and retrieval with memvid algorithm
- Full-text search capabilities

## LLM Client Architecture

### 1. OpenAI Client (`src/openai.rs`)
A mature OpenAI client implementation with:
- Full API coverage (chat completions, embeddings, model listing)
- Robust error handling
- Async/await support
- Rate limiting awareness
- Comprehensive testing

### 2. Local LLM Client (`src/local_llm.rs`)
A mature local LLM client implementation supporting:
- llama.cpp compatible HTTP endpoints
- Full parameter control (temperature, top_k, top_p, etc.)
- Health checking
- Chat completion formatting
- Comprehensive testing

### 3. LLM Provider Abstraction (`src/local_llm.rs#LLMProvider`)
A unified interface that:
- Abstracts differences between provider APIs
- Supports seamless switching between providers
- Handles provider-specific configurations
- Provides consistent error handling

### 4. LLM Orchestration (`src/llm_orchestrator.rs`)
Advanced orchestration features:
- Multi-provider fan-out capabilities
- Quota management
- Provider selection algorithms
- Runtime state management

## Configuration

The system is configured via TOML configuration files (e.g., `wren3.toml`) with:

```toml
[openai]
api_key = "your-api-key"
default_model = "gpt-3.5-turbo"
embedding_model = "text-embedding-ada-002"

[local_llm]
endpoint = "http://localhost:8080"
model_name = "llama-2-7b"
context_length = 4096
temperature = 0.8
```

## Query Pipeline Integration

The LLM clients are integrated into a sophisticated query pipeline:
1. Document chunks are stored with vector embeddings
2. User queries are converted to embeddings
3. Similar documents are retrieved using cosine similarity
4. Context is built from retrieved documents
5. Query is submitted to selected LLM provider
6. Results are returned to the user

## TUI Integration

The terminal UI provides access to all LLM functionality through an intuitive interface with keyboard shortcuts for common operations.

## Quality Assurance

The implementation includes:
- Comprehensive unit tests for all LLM client functionality
- Integration tests using mock servers
- Async testing for concurrent operations
- Error handling tests
- Configuration validation

## API Shim

As an additional component, I've created a CouchDB 1.7.2 compatible API shim with:
- Persistent memvid store using efficient VFS mapping
- Blob storage for attachments
- Complete API compatibility
- No SQL dependencies

This system represents a mature LLM client architecture with multiple provider support, orchestration capabilities, and comprehensive error handling.