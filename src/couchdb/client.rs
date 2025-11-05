use crate::couchdb::config::CouchDbConfig;
use crate::couchdb::models::{ChunkVectors, MemvidChunk, MemvidDocument};
use crate::couchdb::MemvidIngestParams;
use crate::error_handling::{log_info, Result};
use crate::log_performance;
use couch_rs::database::Database;
use couch_rs::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct CouchDBClient {
    db: Database,
    config: CouchDbConfig,
}

#[derive(Debug, Clone)]
pub struct MemvidIngestRequest {
    pub chunks: Vec<MemvidChunk>,
    pub vectors: ChunkVectors,
    pub cognitive_load: f64,
    pub compression_ratio: f64,
    pub taxonomical_depth: i32,
    pub content_hash: String,
}

impl MemvidIngestRequest {
    pub fn new(
        chunks: Vec<MemvidChunk>,
        vectors: ChunkVectors,
        cognitive_load: f64,
        compression_ratio: f64,
        taxonomical_depth: i32,
        content_hash: String,
    ) -> Self {
        Self {
            chunks,
            vectors,
            cognitive_load,
            compression_ratio,
            taxonomical_depth,
            content_hash,
        }
    }

    pub fn into_document(self) -> MemvidDocument {
        MemvidDocument::new(
            self.chunks,
            self.vectors,
            self.cognitive_load,
            self.compression_ratio,
            self.taxonomical_depth,
            self.content_hash,
        )
    }
}

impl CouchDBClient {
    pub async fn new(url: &str, db_name: &str) -> Result<Self> {
        Self::from_config(CouchDbConfig::new(url, db_name)).await
    }

    pub async fn from_config(config: CouchDbConfig) -> Result<Self> {
        let (username, password) = config.auth_tuple();
        let client = Client::new(&config.url, username, password)?;

        match client.make_db(&config.database).await {
            Ok(_) => (),
            Err(e) => {
                if !e.to_string().contains("412") && !e.to_string().contains("file_exists") {
                    return Err(e.into());
                }
            }
        }

        let db = client.db(&config.database).await?;

        Ok(Self { db, config })
    }

    pub fn config(&self) -> &CouchDbConfig {
        &self.config
    }

    pub async fn save_document(&self, doc: &MemvidDocument) -> Result<String> {
        log_info(&format!("Saving document to CouchDB: {}", doc.id));
        let start_time = Instant::now();

        let mut doc_value = serde_json::to_value(doc)?;
        let result = self.db.create(&mut doc_value).await?;

        let elapsed = start_time.elapsed();
        log_performance!("save_document", {
            log_info(&format!(
                "Document {} saved successfully in {:.2?}ms",
                result.id,
                elapsed.as_millis()
            ));
        });

        Ok(result.id)
    }

    pub async fn save_state_as_document<T>(&self, state: &T, doc_id: Option<&str>) -> Result<String>
    where
        T: serde::Serialize,
    {
        log_info("Saving state to CouchDB as a single document");
        let start_time = Instant::now();

        let mut doc_value = serde_json::to_value(state)?;
        
        // Ensure we have an object we can modify
        let obj = doc_value
            .as_object_mut()
            .ok_or_else(|| anyhow::anyhow!("State serialization failed - not an object"))?;

        // Add a document type field for easier identification
        obj.insert("_id".to_string(), serde_json::to_value(doc_id.unwrap_or("orchestrator_state"))?.into());

        // For views to work properly with the providers, make sure the structure is as expected
        // If the state itself is the providers object, we're good
        // Otherwise, we might need to wrap it differently

        let result = self.db.create(&mut doc_value).await?;

        let elapsed = start_time.elapsed();
        log_performance!("save_state_as_document", {
            log_info(&format!(
                "State document {} saved successfully in {:.2?}ms",
                result.id,
                elapsed.as_millis()
            ));
        });

        Ok(result.id)
    }

    pub async fn get_document_by_id(&self, doc_id: &str) -> Result<Value> {
        log_info(&format!("Retrieving document from CouchDB: {}", doc_id));
        let start_time = Instant::now();

        let doc: Value = self.db.get(doc_id).await?;

        let elapsed = start_time.elapsed();
        log_performance!("get_document_by_id", {
            log_info(&format!(
                "Document {} retrieved successfully in {:.2?}ms",
                doc_id,
                elapsed.as_millis()
            ));
        });

        Ok(doc)
    }

    pub async fn get_document(&self, doc_id: &str) -> Result<MemvidDocument> {
        log_info(&format!("Retrieving document from CouchDB: {}", doc_id));
        let start_time = Instant::now();

        let doc: Value = self.db.get(doc_id).await?;
        let memvid_doc: MemvidDocument = serde_json::from_value(doc)?;

        let elapsed = start_time.elapsed();
        log_performance!("get_document", {
            log_info(&format!(
                "Document {} retrieved successfully in {:.2?}ms",
                doc_id,
                elapsed.as_millis()
            ));
        });

        Ok(memvid_doc)
    }

    #[allow(dead_code)]
    pub async fn delete_document_with_rev(&self, doc_id: &str, rev: &str) -> Result<()> {
        let delete_doc = serde_json::json!({
            "_id": doc_id,
            "_rev": rev,
            "_deleted": true
        });

        let mut docs = vec![delete_doc];
        self.db.bulk_docs(&mut docs).await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn delete_document(&self, doc_id: &str) -> Result<()> {
        let document = self.get_document(doc_id).await?;
        let revision = document
            .rev
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("revision missing for document {doc_id}"))?;
        self.delete_document_with_rev(doc_id, revision).await
    }

    pub async fn create_view(
        &self,
        design_doc_id: &str,
        view_name: &str,
        map_function: &str,
    ) -> Result<()> {
        let design_doc_id = format!("_design/{}", design_doc_id);
        let mut design_doc = serde_json::json!({
            "_id": design_doc_id,
            "views": {
                view_name: {
                    "map": map_function
                }
            }
        });

        match self.db.create(&mut design_doc).await {
            Ok(_) => Ok(()),
            Err(_) => self.update_design_doc(&design_doc).await,
        }
    }

    pub async fn query_view(&self, design_doc_id: &str, view_name: &str) -> Result<Vec<Value>> {
        let view_path = format!("_design/{}/_view/{}", design_doc_id, view_name);
        let response = self.db.get::<Value>(&view_path).await?;

        if let Some(rows) = response.get("rows").and_then(|r| r.as_array()) {
            Ok(rows.clone())
        } else {
            Ok(vec![])
        }
    }

    pub async fn query_view_with_params(
        &self,
        design_doc_id: &str,
        view_name: &str,
        params: HashMap<&str, Value>,
    ) -> Result<Vec<Value>> {
        let mut view_path = format!("_design/{}/_view/{}", design_doc_id, view_name);
        if !params.is_empty() {
            let query_params: Vec<String> =
                params.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            view_path.push('?');
            view_path.push_str(&query_params.join("&"));
        }

        let response = self.db.get::<Value>(&view_path).await?;

        if let Some(rows) = response.get("rows").and_then(|r| r.as_array()) {
            Ok(rows.clone())
        } else {
            Ok(vec![])
        }
    }

    pub async fn ingest_memvid_document(
        &self,
        chunks: Vec<MemvidChunk>,
        vectors: ChunkVectors,
        cognitive_load: f64,
        compression_ratio: f64,
        taxonomical_depth: i32,
        content_hash: String,
    ) -> Result<String> {
        let params = (
            chunks,
            vectors,
            cognitive_load,
            compression_ratio,
            taxonomical_depth,
            content_hash,
        );

        let mut results = self.batch_ingest_memvid_documents(vec![params]).await?;

        Ok(results
            .pop()
            .ok_or_else(|| anyhow::anyhow!("expected an identifier for ingested document"))?)
    }

    pub async fn ingest_memvid_request(&self, request: MemvidIngestRequest) -> Result<String> {
        log_info(&format!(
            "Ingesting memvid document with {} chunks, cognitive_load: {}, compression_ratio: {}",
            request.chunks.len(),
            request.cognitive_load,
            request.compression_ratio
        ));

        let doc = request.into_document();
        self.save_document(&doc).await
    }

    pub async fn batch_ingest_memvid_documents(
        &self,
        documents: Vec<MemvidIngestParams>,
    ) -> Result<Vec<String>> {
        let mut results = Vec::with_capacity(documents.len());

        for params in documents {
            let request = MemvidIngestRequest::from(params);
            let result = self.ingest_memvid_request(request).await?;
            results.push(result);
        }

        Ok(results)
    }

    async fn update_design_doc(&self, desired: &Value) -> Result<()> {
        let doc_id = desired
            .get("_id")
            .and_then(|id| id.as_str())
            .ok_or_else(|| anyhow::anyhow!("design document missing _id"))?;

        let mut existing = match self.db.get::<Value>(doc_id).await {
            Ok(doc) => doc,
            Err(_) => return Ok(()),
        };

        let rev = existing
            .get("_rev")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string();

        let mut desired = desired.clone();
        desired["_rev"] = Value::String(rev.clone());

        merge_views(&mut existing, &desired);

        let mut docs = vec![existing];
        self.db.bulk_docs(&mut docs).await?;
        Ok(())
    }
}

fn merge_views(target: &mut Value, source: &Value) {
    if let (Some(target_views), Some(source_views)) = (
        target.get_mut("views").and_then(|v| v.as_object_mut()),
        source.get("views").and_then(|v| v.as_object()),
    ) {
        for (name, definition) in source_views {
            target_views.insert(name.clone(), definition.clone());
        }
    }
}

impl From<crate::couchdb::MemvidIngestParams> for MemvidIngestRequest {
    fn from(params: crate::couchdb::MemvidIngestParams) -> Self {
        Self::new(params.0, params.1, params.2, params.3, params.4, params.5)
    }
}
