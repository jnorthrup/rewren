//! Facade module that re-exports the CouchDB implementation housed under
//! `src/couchdb/`.
//!
//! Keeping this file ensures existing `crate::couchdb` imports remain valid
//! while the actual code lives in the dedicated module tree.

mod client;
mod config;
mod models;

pub use client::CouchDBClient;
pub use config::CouchDbConfig;
#[allow(unused_imports)]
pub use models::{ChunkVectors, MemvidChunk, MemvidDocument};

pub type MemvidIngestParams = (Vec<MemvidChunk>, ChunkVectors, f64, f64, i32, String);

#[cfg(test)]
mod tests;
