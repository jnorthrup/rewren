# wren3 - LLM Provider Orchestration System

wren3 is an LLM provider orchestration system with memvid-based content storage, QA-centric TUI, and CouchDB persistence. It provides a unified interface for querying and managing document collections using various LLM providers.

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

## Features

- ✅ OpenAI API client
- ✅ Query pipeline (view → rank → LLM context)
- ✅ ratatui TUI interface
- ✅ tmux screenshot capture
- ✅ QA self-test framework
- ✅ Test report generation
- ✅ Local model support (llama.cpp HTTP)
- ✅ Error handling and logging
- ✅ Configuration system (TOML)
- ✅ Documentation

## Installation

### Prerequisites

- Rust 1.70+
- Python 3.8+
- CouchDB
- tmux (for QA features)

### Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd wren3
   ```

2. Install Python dependencies:

   ```bash
   pip install -r requirements.txt  # If you have one
   ```

3. Build the project:

   ```bash
   cargo build --release
   ```

4. Configure the system:

   ```bash
   # Create default config
   ./target/release/wren3 --init-config
   ```

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

## Usage

### Basic Usage

```bash
# Start the TUI
./target/release/wren3

# Run with specific config
./target/release/wren3 --config /path/to/config.toml

# Initialize default config
./target/release/wren3 --init-config
```

### TUI Controls

- `1`: Enter query mode
- `2`: Access settings
- `3`: Test mode
- `t`: Toggle test mode
- `q` or `Esc`: Quit/back
- `↑/↓`: Navigate results
- `Enter`: View document details
- `s`: Take screenshot (in test mode)

### Query Interface

1. Press `1` in the main menu to enter query mode
2. Type your query and press Enter
3. Browse results with arrow keys
4. Press Enter to view full document content
5. Press Esc to return to results

## Development

### Building

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

### Project Structure

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
└── test_framework.rs    # QA testing framework

python/
└── memvid_entropic_bridge.py  # Python memvid algorithms
```

### Key Dependencies

- `pyo3`: Python integration
- `ratatui`: Terminal UI framework
- `crossterm`: Terminal control
- `reqwest`: HTTP client
- `couch_rs`: CouchDB client
- `serde`: Serialization
- `tokio`: Async runtime
- `tracing`: Logging framework

## QA Testing

wren3 includes a comprehensive QA framework with automated testing and screenshot capture.

### Running Tests

```bash
# Run smoke test
./target/release/wren3 --run-smoke-test

# Run full test suite
./target/release/wren3 --run-tests

# Generate HTML report
./target/release/wren3 --generate-report
```

### Test Structure

Tests are organized in suites with setup/teardown steps:

- **Smoke Test**: Basic functionality verification
- **UI Tests**: TUI interaction testing
- **Integration Tests**: Full pipeline testing

### Screenshot Capture

The QA framework can capture tmux screenshots during test execution for visual verification of UI states.

## API Reference

### Core Types

#### MemvidDocument

```rust
struct MemvidDocument {
    id: DocumentId,
    chunks: Vec<MemvidChunk>,
    vectors: HashMap<String, Vec<f64>>,
    cognitive_load: f64,
    compression_ratio: f64,
    taxonomical_depth: i32,
    content_hash: String,
}
```

#### QueryResult

```rust
struct QueryResult {
    document_id: String,
    chunk_id: String,
    content: String,
    similarity_score: f64,
    cognitive_load: f64,
    vector: Vec<f64>,
}
```

### LLM Providers

#### OpenAI Client

```rust
let client = OpenAIClient::new(api_key);
let response = client.chat_completion_simple("gpt-3.5-turbo", messages, Some(1000), Some(0.7)).await?;
```

#### Local LLM Client

```rust
let client = LocalLLMClient::new(endpoint, model_name, context_length, temperature);
let response = client.completion_simple(prompt, Some(256)).await?;
```

## Troubleshooting

### Common Issues

1. **PyO3 Import Errors**
   - Ensure Python memvid bridge is in the python/ directory
   - Check Python path configuration

2. **CouchDB Connection Issues**
   - Verify CouchDB is running on the configured URL
   - Check database permissions

3. **TUI Display Issues**
   - Ensure terminal supports UTF-8
   - Check color support

4. **LLM API Errors**
   - Verify API keys are set correctly
   - Check rate limits and quotas

### Logging

wren3 uses structured logging with configurable levels. Logs include:

- Operation timing
- Error details with context
- Performance metrics
- Test execution results

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the QA suite
6. Submit a pull request

### Code Style

- Follow Rust standard formatting (`cargo fmt`)
- Use `cargo clippy` for linting
- Add documentation comments for public APIs
- Include unit tests for new functionality

## License

[License information]

## Acknowledgments

- memvid algorithm implementation
- CouchDB for document storage
- ratatui for terminal UI framework
- PyO3 for Python integration
