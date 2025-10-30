# wren3 - LLM Provider Orchestration System

## Overview

wren3 is an LLM provider orchestration system with memvid-based content storage, QA-centric TUI, and CouchDB persistence. It provides a unified interface for querying and managing document collections using various LLM providers. The system is built in Rust with PyO3 integration for Python memvid algorithms.

The architecture follows a modular design with distinct components for LLM orchestration, database storage, TUI interface, and QA testing, all coordinated through a configuration system.

## Architecture

```
Rust (wren3)
├── TUI (ratatui + QA framework)
├── LLM orchestration (OpenAI, llama.cpp)
├── CouchDB client (couch_rs)
└── memvid bridge (PyO3 sync wrapper)
      ↓
    Python memvid (~/work/tika4all/memvid*.py)
      ↓
    CouchDB (local/remote)
```

### Core Components

- **PyO3 Bridge**: Synchronous Python integration for memvid algorithms
- **Query Pipeline**: View → rank → LLM context building
- **TUI Interface**: ratatui-based terminal interface
- **LLM Providers**: OpenAI API and llama.cpp HTTP support
- **QA Framework**: Self-testing with tmux screenshot capture
- **Configuration**: TOML/YAML configuration system

## Building and Running

### Prerequisites

- Rust 1.70+
- Python 3.8+
- CouchDB
- tmux (for QA features)

### Build Commands

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Run tests
cargo test

# Check code
cargo check
```

### Running the Application

```bash
# Start the TUI (default mode)
./target/release/wren3

# Run with specific config
./target/release/wren3 --config /path/to/config.toml

# Run in TUI mode (explicit)
./target/release/wren3 tui

# Run smoke tests
./target/release/wren3 smoke-test

# Run full test suite
./target/release/wren3 test

# Initialize default config
./target/release/wren3 init-config

# Show current configuration
./target/release/wren3 show-config
```

## Project Structure

```
src/
├── main.rs              # Application entry point
├── couchdb.rs           # CouchDB client and document handling
├── openai.rs            # OpenAI API client
├── local_llm.rs         # Local LLM (llama.cpp) client
├── query_pipeline.rs    # Query processing and ranking
├── tui.rs               # Terminal user interface
├── tmux.rs              # tmux screenshot capture
├── error_handling.rs    # Error types and logging
├── config.rs            # Configuration management
├── test_framework.rs    # QA testing framework
└── memvid.rs            # PyO3 bridge to Python memvid
```

```
python/
└── memvid_entropic_bridge.py  # Python memvid algorithms
```

## Key Dependencies

- `pyo3`: Python integration
- `ratatui`: Terminal UI framework
- `crossterm`: Terminal control
- `reqwest`: HTTP client
- `couch_rs`: CouchDB client
- `serde`: Serialization
- `tokio`: Async runtime
- `tracing`: Logging framework

## Configuration

wren3 uses TOML or YAML configuration files. It searches for config files in the following order:

1. `./wren3.toml`
2. `./wren3.yaml`
3. `./config/wren3.toml`
4. `./config/wren3.yaml`
5. `~/wren3.toml`
6. `~/wren3.yaml`
7. `~/.config/wren3.toml`
8. `~/.config/wren3.yaml`

### Example Configuration

```toml
[database]
url = "http://localhost:5984"
name = "wren3-dev"

[openai]
api_key = "your-openai-api-key"
base_url = "https://api.openai.com/v1"
default_model = "gpt-3.5-turbo"
embedding_model = "text-embedding-ada-002"
max_tokens = 1000
temperature = 0.7

[local_llm]
endpoint = "http://localhost:8080"
model_name = "llama-2-7b"
context_length = 4096
temperature = 0.8

[tui]
enable_mouse = true
theme = "default"

[qa]
enabled = true
screenshot_dir = "./screenshots"
auto_screenshot = false
test_timeout_seconds = 30

[logging]
level = "info"
file = "wren3.log"
max_file_size_mb = 10
max_files = 5
```

### Environment Variables

- `WREN3_DATABASE_URL`: Override database URL
- `WREN3_DATABASE_NAME`: Override database name
- `OPENAI_API_KEY`: Set OpenAI API key
- `WREN3_LOG_LEVEL`: Set logging level (error, warn, info, debug, trace)

## TUI Controls

- `1`: Enter query mode
- `2`: Access settings
- `3`: Test mode
- `t`: Toggle test mode
- `q` or `Esc`: Quit/back
- `↑/↓`: Navigate results
- `Enter`: View document details
- `s`: Take screenshot (in test mode)

## Development Conventions

- Follow Rust standard formatting (`cargo fmt`)
- Use `cargo clippy` for linting
- Add documentation comments for public APIs
- Include unit tests for new functionality
- Use structured logging with the tracing framework
- Error handling through the custom Wren3Error enum

## QA Testing

The system includes a comprehensive QA framework with automated testing and screenshot capture:

- **Smoke Test**: Basic functionality verification
- **UI Tests**: TUI interaction testing
- **Integration Tests**: Full pipeline testing

Run tests with:
- `./target/release/wren3 smoke-test`
- `./target/release/wren3 test`
- Generate HTML reports after test execution

The QA framework can capture tmux screenshots during test execution for visual verification of UI states.