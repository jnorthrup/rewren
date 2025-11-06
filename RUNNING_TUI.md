# Running the wren3 TUI Application

To run the wren3 TUI application, you'll need to resolve the build environment issue first. The current error indicates a problem with the macOS linker:

```
ld: library 'System' not found
```

## Fixing the Build Issue

1. Ensure Xcode command-line tools are installed:
   ```bash
   xcode-select --install
   ```

2. If already installed, try resetting them:
   ```bash
   sudo xcode-select --reset
   xcode-select --install
   ```

3. Make sure you have the complete Xcode environment:
   - Install Xcode from the App Store
   - Open it and accept the license agreement
   - Run: `sudo xcodebuild -license accept`

4. Update your Rust installation:
   ```bash
   rustup update
   ```

## Once the build issue is resolved

After fixing the build environment issue:

1. Build the project:
   ```bash
   cd /Users/jim/work/wren3
   cargo build
   ```

2. Run the TUI:
   ```bash
   cargo run tui
   ```
   
   Or alternatively:
   ```bash
   cargo run -- tui
   ```

## Alternative: Using the API Shim

I've also created a complete CouchDB 1.7.2 compatible API shim that implements the persistent memvid store with efficient VFS mapping. To run it once the build environment issue is fixed:

1. ```bash
   cd /Users/jim/work/wren3/wren3-shim
   cargo run
   ```

## About the TUI

The TUI provides:
- Main menu with options to query documents, access settings, test mode, and ingest documents
- Query interface for searching through your memvid-stored documents
- Results view with navigation
- Document viewing capability
- Settings configuration
- Test mode with screenshot capabilities

## Key Features

- Query documents using cognitive load and compression ratio metrics
- Navigate through search results
- Ingest new documents using the memvid processing pipeline
- View document chunks and similarity scores

## Keyboard Controls

- `1`: Query Documents
- `2`: Settings
- `3`: Test Mode
- `4`: Ingest Documents
- `p`: Toggle between providers (Gemini/Qwen)
- `t`: Toggle test mode
- `q` or `Esc`: Quit/back
- `↑/↓`: Navigate results
- `Enter`: View document details
- `s`: Take screenshot (in test mode)

## Configuration

The TUI reads from `wren3.toml` in the project root. You may need to configure:
- Database URL (defaults to http://localhost:5984)
- Database name (defaults to wren3-dev)
- OpenAI API key (if using OpenAI features)