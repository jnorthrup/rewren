mod config;
mod couchdb;
#[cfg(test)]
mod couchdb_stub;
mod error_handling;
mod llm_orchestrator;
mod local_llm;
mod memvid;
mod openai;
mod query_pipeline;
mod test_framework;
mod tmux;
mod tui;

use crate::config::ConfigManager;
use crate::error_handling::{init_logging, log_info, Result, Wren3Error};
use crate::memvid::MemvidBridge;
use crate::query_pipeline::QueryPipeline;
use crate::test_framework::QATestFramework;
use crate::tui::run_tui;
use clap::{Arg, Command};
use std::path::PathBuf;

#[derive(Debug)]
struct Wren3App {
    config_manager: ConfigManager,
    query_pipeline: Option<QueryPipeline>,
    memvid_bridge: Option<MemvidBridge>,
    test_framework: QATestFramework,
}

impl Wren3App {
    async fn new(config_path: Option<PathBuf>) -> Result<Self> {
        // Initialize logging
        init_logging()?;

        // Load configuration
        let config_manager = if let Some(path) = config_path {
            ConfigManager::from_file(&path)?
        } else {
            ConfigManager::new()?
        };

        let config = config_manager.get_config().clone();

        // Try to initialize components, but don't fail if database is not available
        let query_pipeline = match QueryPipeline::new(
            &config.database,
            config.openai.as_ref().map(|o| o.api_key.clone()),
        )
        .await
        {
            Ok(pipeline) => {
                log_info("Database connection established");
                Some(pipeline)
            }
            Err(e) => {
                log_info(&format!(
                    "Database not available, running in offline mode: {}",
                    e
                ));
                None
            }
        };

        let memvid_bridge = Some(MemvidBridge::new()?);

        let test_framework = QATestFramework::new(&config.qa.screenshot_dir);

        log_info("wren3 initialized successfully");

        Ok(Self {
            config_manager,
            query_pipeline,
            memvid_bridge,
            test_framework,
        })
    }

    async fn run_tui_mode(&mut self) -> Result<()> {
        log_info("Starting TUI mode");

        let query_pipeline = self.query_pipeline.clone();
        let memvid_bridge = self.memvid_bridge.as_ref().unwrap().clone();

        // Build provider clients from config
        let config = self.config_manager.get_config();
        let mut providers = std::collections::HashMap::new();

        for (name, pconf) in &config.providers {
            log_info(&format!("Initializing provider: {} ({})", name, pconf.base_url));
            let client = crate::openai::OpenAIClient::new(pconf.api_key.clone())
                .with_base_url(pconf.base_url.clone());
            providers.insert(name.clone(), client);
        }

        if providers.is_empty() {
            log_info("No providers configured - check environment variables (NVIDIA_API_KEY, OPENAI_API_KEY)");
        }

        run_tui(query_pipeline, memvid_bridge, providers)
            .await
            .map_err(Wren3Error::from)
    }

    async fn run_smoke_test(&self) -> Result<()> {
        log_info("Running smoke test");
        let result = self.test_framework.run_smoke_test().await?;
        log_info(&format!(
            "Smoke test completed: {:.1}% pass rate",
            result.success_rate
        ));
        Ok(())
    }

    async fn run_full_tests(&mut self) -> Result<()> {
        log_info("Running full test suite");
        let suite = self.test_framework.create_default_test_suite();
        self.test_framework.add_test_suite(suite);
        let result = self
            .test_framework
            .run_test_suite("wren3_basic_ui_test")
            .await?;
        log_info(&format!(
            "Full test suite completed: {:.1}% pass rate",
            result.success_rate
        ));
        Ok(())
    }

    async fn run_ingest(&mut self, path: &str) -> Result<()> {
        log_info(&format!("Starting ingestion of: {}", path));

        let memvid_bridge = self.memvid_bridge.as_ref().unwrap();

        // Process the document with memvid
        let (chunks, vectors) = memvid_bridge.process_file(path)?;

        // For now, we'll use placeholder values for the other metrics
        // In a more complete implementation, the memvid processing would return all these values
        let cognitive_load = 50.0; // Placeholder value
        let compression_ratio = 0.5; // Placeholder value
        let taxonomical_depth = 3; // Placeholder value
        let content_hash = format!("{:x}", md5::compute(path.as_bytes())); // Placeholder hash

        // Ensure a CouchDB-backed QueryPipeline is available. Ingest requires a backing
        // store to persist memvid documents. If the database is unavailable, return a
        // clear error instead of panicking.
        let couchdb_client = match &self.query_pipeline {
            Some(p) => &p.couch_client,
            None => {
                return Err(Wren3Error::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "CouchDB not available: start the database and restart the app to ingest",
                )));
            }
        };

        // Ingest the processed document into CouchDB
        let doc_id = couchdb_client
            .ingest_memvid_document(
                chunks,
                vectors,
                cognitive_load,
                compression_ratio,
                taxonomical_depth,
                content_hash,
            )
            .await?;

        let stored_doc = couchdb_client.get_document(&doc_id).await?;

        log_info(&format!(
            "Successfully ingested document with ID: {} ({} chunks, rev {})",
            doc_id,
            stored_doc.chunks.len(),
            stored_doc.rev.as_deref().unwrap_or("<unknown>")
        ));
        Ok(())
    }

    fn init_config(&self) -> Result<()> {
        log_info("Initializing default configuration");
        // Config is already created in ConfigManager::new()
        log_info("Default configuration created at ./wren3.toml");
        Ok(())
    }

    fn show_config(&self) -> Result<()> {
        let config = self.config_manager.get_config();
        println!("Current Configuration:");
        println!("====================");
        println!("Database URL: {}", config.database.url);
        println!("Database Name: {}", config.database.name);
        println!("OpenAI Configured: {}", config.openai.is_some());
        println!("Local LLM Configured: {}", config.local_llm.is_some());
        println!("QA Enabled: {}", config.qa.enabled);
        println!("Log Level: {}", config.logging.level);
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    pyo3::prepare_freethreaded_python();

    let matches = Command::new("wren3")
        .version("0.1.0")
        .author("wren3")
        .about("LLM Provider Orchestration System")
        .arg(
            Arg::new("config")
                .short('c')
                .long("config")
                .value_name("FILE")
                .help("Sets a custom config file")
                .value_parser(clap::value_parser!(PathBuf)),
        )
        .subcommand(
            Command::new("tui")
                .about("Run the terminal user interface")
                .alias("ui"),
        )
        .subcommand(
            Command::new("smoke-test")
                .about("Run smoke tests")
                .alias("smoke"),
        )
        .subcommand(
            Command::new("test")
                .about("Run full test suite")
                .alias("tests"),
        )
        .subcommand(
            Command::new("init-config")
                .about("Initialize default configuration")
                .alias("init"),
        )
        .subcommand(
            Command::new("show-config")
                .about("Show current configuration")
                .alias("config"),
        )
        .subcommand(
            Command::new("ingest")
                .about("Ingest a document using memvid")
                .arg(
                    Arg::new("path")
                        .required(true)
                        .value_name("PATH")
                        .help("Path to the document to ingest"),
                ),
        )
        .get_matches();

    let config_path = matches.get_one::<PathBuf>("config").cloned();

    let mut app = Wren3App::new(config_path).await.map_err(|e| {
        eprintln!("Failed to initialize wren3: {}", e);
        e
    })?;

    let result = match matches.subcommand() {
        Some(("tui", _)) => app.run_tui_mode().await,
        Some(("smoke-test", _)) => app.run_smoke_test().await,
        Some(("test", _)) => app.run_full_tests().await,
        Some(("init-config", _)) => app.init_config(),
        Some(("show-config", _)) => app.show_config(),
        Some(("ingest", sub_matches)) => {
            if let Some(path) = sub_matches.get_one::<String>("path") {
                app.run_ingest(path).await
            } else {
                Err(Wren3Error::Validation(
                    "Path argument required for ingest".to_string(),
                ))
            }
        }
        _ => app.run_tui_mode().await, // Default to TUI mode
    };

    if let Err(e) = result {
        log_info(&format!("Application error: {}", e));
        return Err(e);
    }

    Ok(())
}
