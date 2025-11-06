//! CouchDB 1.7.2 Compatible API Shim (MemVid Implementation)
//! 
//! This application provides a complete API compatibility layer for CouchDB 1.7.2
//! while using an in-memory memvid store and blob storage for attachments.

mod api;
mod blobstore;
mod memvid_store;
mod models;
mod views;

use axum::{
    extract::{DefaultBodyLimit, State},
    http::Method,
    Router,
};
use config::{Config, File};
use serde::Deserialize;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[derive(Debug, Deserialize)]
struct Settings {
    host: String,
    port: u16,
    blob_dir: String,
    memvid_dir: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            host: "127.0.0.1".to_string(),
            port: 5984,
            blob_dir: "./blobs".to_string(),
            memvid_dir: "./memvid_data".to_string(),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("setting default subscriber failed");

    // Load configuration
    let settings: Settings = {
        let mut config = Config::builder()
            .add_source(File::with_name("./config/default.toml").required(false))
            .add_source(File::with_name("./config/local.toml").required(false))
            .add_source(config::Environment::with_prefix("SHIM"));

        match config.build() {
            Ok(config) => config.try_deserialize::<Settings>().unwrap_or_default(),
            Err(_) => Settings::default(),
        }
    };

    info!("Starting CouchDB 1.7.2 compatible API shim with persistent MemVid store");

    // Initialize the persistent memvid store with VFS mapping
    let memvid_store = crate::memvid_store::MemVidStore::new(PathBuf::from(&settings.memvid_dir))?;
    
    // Initialize the blob store
    let blob_store = crate::blobstore::BlobStore::new(PathBuf::from(&settings.blob_dir))?;

    // Configure CORS
    let cors_layer = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    // Build the application with the required services
    let app = Router::new()
        .merge(api::router())
        .with_state(api::AppState {
            memvid_store,
            blob_store,
        })
        .layer(cors_layer)
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)); // 100MB body limit

    // Configure address to bind to
    let addr = SocketAddr::from((settings.host.parse::<std::net::Ipv4Addr>()?, settings.port));
    info!("Server starting on http://{}", addr);

    // Start the server
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();

    Ok(())
}