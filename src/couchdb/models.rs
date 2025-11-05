use couch_rs::types::document::DocumentId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type ChunkVectors = HashMap<String, Vec<f64>>;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MemvidChunk {
    pub id: String,
    pub content: String,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MemvidDocument {
    #[serde(rename = "_id")]
    pub id: DocumentId,
    #[serde(rename = "_rev", skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
    pub chunks: Vec<MemvidChunk>,
    pub vectors: ChunkVectors,
    pub cognitive_load: f64,
    pub compression_ratio: f64,
    pub taxonomical_depth: i32,
    pub content_hash: String,
}

impl MemvidDocument {
    pub fn new(
        chunks: Vec<MemvidChunk>,
        vectors: ChunkVectors,
        cognitive_load: f64,
        compression_ratio: f64,
        taxonomical_depth: i32,
        content_hash: String,
    ) -> Self {
        Self {
            id: DocumentId::new(),
            rev: None,
            chunks,
            vectors,
            cognitive_load,
            compression_ratio,
            taxonomical_depth,
            content_hash,
        }
    }
}
