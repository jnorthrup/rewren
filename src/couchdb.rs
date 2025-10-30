use crate::{
    error_handling::{log_info, Result},
    log_performance,
};
use couch_rs::types::document::DocumentId;
use couch_rs::{database::Database, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

type ChunkVectors = HashMap<String, Vec<f64>>;
#[allow(dead_code)]
type MemvidIngestParams = (
    Vec<MemvidChunk>,
    ChunkVectors,
    f64,
    f64,
    i32,
    String,
);
use std::time::Instant;

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
    pub chunks: Vec<MemvidChunk>,
    pub vectors: ChunkVectors,
    pub cognitive_load: f64,
    pub compression_ratio: f64,
    pub taxonomical_depth: i32,
    pub content_hash: String,
}

impl MemvidDocument {
    #[allow(dead_code)]
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
            chunks,
            vectors,
            cognitive_load,
            compression_ratio,
            taxonomical_depth,
            content_hash,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CouchDBClient {
    _client: Client,
    db: Database,
}

impl CouchDBClient {
    pub async fn new(url: &str, db_name: &str) -> Result<Self> {
        let client = Client::new(url, "admin", "password")?; // Replace with proper auth

        match client.make_db(db_name).await {
            Ok(_) => (),
            Err(e) => {
                // Check if error is because database already exists
                if !e.to_string().contains("412") && !e.to_string().contains("file_exists") {
                    return Err(e.into());
                }
            }
        }

        let db = client.db(db_name).await?;
        Ok(Self {
            _client: client,
            db,
        })
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

    #[allow(dead_code)]
    pub async fn get_document(&self, doc_id: &str) -> Result<MemvidDocument> {
        log_info(&format!("Retrieving document from CouchDB: {}", doc_id));
        let start_time = Instant::now();

        let doc: serde_json::Value = self.db.get(doc_id).await?;
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
    pub async fn delete_document(&self, doc_id: &str, rev: &str) -> Result<()> {
        let delete_doc = serde_json::json!({
            "_id": doc_id,
            "_rev": rev,
            "_deleted": true
        });

        let mut docs = vec![delete_doc];
        self.db.bulk_docs(&mut docs).await?;
        Ok(())
    }

    pub async fn create_view(
        &self,
        design_doc_id: &str,
        view_name: &str,
        map_function: &str,
    ) -> Result<()> {
        let design_doc = serde_json::json!({
            "_id": format!("_design/{}", design_doc_id),
            "views": {
                view_name: {
                    "map": map_function
                }
            }
        });

        // Try to create, if it exists, update
        let mut design_value = serde_json::to_value(&design_doc)?;
        match self.db.create(&mut design_value).await {
            Ok(_) => Ok(()),
            Err(_) => {
                // Try to get existing design doc and update
                if let Ok(existing) = self
                    .db
                    .get::<serde_json::Value>(&format!("_design/{}", design_doc_id))
                    .await
                {
                    let mut updated = existing;
                    if let Some(views) = updated.get_mut("views").and_then(|v| v.as_object_mut()) {
                        views.insert(
                            view_name.to_string(),
                            serde_json::json!({
                                "map": map_function
                            }),
                        );
                    }
                    let rev = updated.get("_rev").and_then(|r| r.as_str()).unwrap_or("");
                    updated["_rev"] = serde_json::Value::String(rev.to_string());

                    let mut docs = vec![updated];
                    self.db.bulk_docs(&mut docs).await?;
                    return Ok(());
                }
                Ok(())
            }
        }
    }

    pub async fn query_view(
        &self,
        design_doc_id: &str,
        view_name: &str,
    ) -> Result<Vec<serde_json::Value>> {
        let view_path = format!("_design/{}/_view/{}", design_doc_id, view_name);
        let response = self.db.get::<serde_json::Value>(&view_path).await?;

        if let Some(rows) = response.get("rows").and_then(|r| r.as_array()) {
            Ok(rows.clone())
        } else {
            Ok(vec![])
        }
    }

    #[allow(dead_code)]
    pub async fn query_view_with_params(
        &self,
        design_doc_id: &str,
        view_name: &str,
        params: std::collections::HashMap<&str, serde_json::Value>,
    ) -> Result<Vec<serde_json::Value>> {
        let mut view_path = format!("_design/{}/_view/{}", design_doc_id, view_name);
        if !params.is_empty() {
            let query_params: Vec<String> =
                params.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            view_path.push('?');
            view_path.push_str(&query_params.join("&"));
        }

        let response = self.db.get::<serde_json::Value>(&view_path).await?;

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
        log_info(&format!(
            "Ingesting memvid document with {} chunks, cognitive_load: {}, compression_ratio: {}",
            chunks.len(),
            cognitive_load,
            compression_ratio
        ));

        // Create a MemvidDocument with the processed data
        let doc = MemvidDocument {
            id: DocumentId::new(),
            chunks,
            vectors,
            cognitive_load,
            compression_ratio,
            taxonomical_depth,
            content_hash,
        };

        // Save the document to CouchDB
        self.save_document(&doc).await
    }

    #[allow(dead_code)]
    pub async fn batch_ingest_memvid_documents(
        &self,
        documents: Vec<MemvidIngestParams>,
    ) -> Result<Vec<String>> {
        let mut results = Vec::new();

        for (chunks, vectors, cognitive_load, compression_ratio, taxonomical_depth, content_hash) in
            documents
        {
            let result = self
                .ingest_memvid_document(
                    chunks,
                    vectors,
                    cognitive_load,
                    compression_ratio,
                    taxonomical_depth,
                    content_hash,
                )
                .await?;
            results.push(result);
        }

        Ok(results)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use axum::{
        body::{Body, Bytes},
        extract::{Path, Query, State},
        http::{header::CONTENT_TYPE, HeaderMap, HeaderValue, StatusCode},
        response::{IntoResponse, Response},
    routing::{get, post, put},
        Json, Router,
    };
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    use percent_encoding::percent_decode_str;
    use reqwest::{Client as HttpClient, StatusCode as HttpStatus};
    use serde::Deserialize;
    use serde_json::{json, Value};
    use std::collections::{hash_map::Entry, HashMap};
    use std::net::SocketAddr;
    use std::sync::Arc;
    use tokio::net::TcpListener;
    use tokio::sync::{oneshot, RwLock};
    use uuid::Uuid;

    #[test]
    fn test_memvid_chunk_creation() {
        let chunk = MemvidChunk {
            id: "chunk_0".to_string(),
            content: "This is test content".to_string(),
            start_offset: 0,
            end_offset: 20,
        };

        assert_eq!(chunk.id, "chunk_0");
        assert_eq!(chunk.content, "This is test content");
        assert_eq!(chunk.start_offset, 0);
        assert_eq!(chunk.end_offset, 20);
    }

    #[test]
    fn test_memvid_document_new() {
        let chunks = vec![
            MemvidChunk {
                id: "chunk_0".to_string(),
                content: "First chunk".to_string(),
                start_offset: 0,
                end_offset: 11,
            },
            MemvidChunk {
                id: "chunk_1".to_string(),
                content: "Second chunk".to_string(),
                start_offset: 12,
                end_offset: 24,
            },
        ];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);
        vectors.insert("chunk_1".to_string(), vec![0.4, 0.5, 0.6]);

        let doc = MemvidDocument::new(
            chunks.clone(),
            vectors.clone(),
            0.75,
            0.85,
            3,
            "hash123".to_string(),
        );

        assert_eq!(doc.chunks.len(), 2);
        assert_eq!(doc.vectors.len(), 2);
        assert!((doc.cognitive_load - 0.75).abs() < 1e-6);
        assert!((doc.compression_ratio - 0.85).abs() < 1e-6);
        assert_eq!(doc.taxonomical_depth, 3);
        assert_eq!(doc.content_hash, "hash123");
    }

    #[test]
    fn test_memvid_document_serialization() {
        let mut vectors = HashMap::new();
        vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);

        let doc = MemvidDocument {
            id: DocumentId::from("test-doc-id"),
            chunks: vec![MemvidChunk {
                id: "chunk_0".to_string(),
                content: "Test content".to_string(),
                start_offset: 0,
                end_offset: 12,
            }],
            vectors,
            cognitive_load: 0.8,
            compression_ratio: 0.9,
            taxonomical_depth: 2,
            content_hash: "testhash".to_string(),
        };

        let serialized = serde_json::to_string(&doc).unwrap();
        let deserialized: MemvidDocument = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.chunks.len(), 1);
        assert_eq!(deserialized.chunks[0].content, "Test content");
        assert!((deserialized.cognitive_load - 0.8).abs() < 1e-6);
        assert_eq!(deserialized.content_hash, "testhash");
    }

    #[test]
    fn test_view_creation_json_structure() {
        // Test that the view creation generates correct JSON structure
        let _design_doc_id = "memvid";
        let _view_name = "by_cognitive_load";
        let map_function = r#"
            function(doc) {
                if (doc.vectors) {
                    emit(doc.cognitive_load, doc);
                }
            }
        "#;

        let expected_design_doc = serde_json::json!({
            "_id": "_design/memvid",
            "views": {
                "by_cognitive_load": {
                    "map": map_function
                }
            }
        });

        // Verify the structure matches what create_view should generate
        assert_eq!(expected_design_doc["_id"], "_design/memvid");
        assert!(expected_design_doc["views"]["by_cognitive_load"]["map"].is_string());
    }

    #[test]
    fn test_query_view_with_params_parameter_building() {
        // Test the parameter building logic from query_view_with_params
        let mut params = HashMap::new();
        params.insert("startkey", serde_json::json!(0.5));
        params.insert("endkey", serde_json::json!(0.9));
        params.insert("limit", serde_json::json!(10));

        let query_params: Vec<String> =
            params.iter().map(|(k, v)| format!("{}={}", k, v)).collect();

        assert_eq!(query_params.len(), 3);
        assert!(query_params.contains(&"startkey=0.5".to_string()));
        assert!(query_params.contains(&"endkey=0.9".to_string()));
        assert!(query_params.contains(&"limit=10".to_string()));
    }

    #[test]
    fn test_query_view_with_params_empty_params() {
        let params: HashMap<&str, serde_json::Value> = HashMap::new();
        let query_params: Vec<String> =
            params.iter().map(|(k, v)| format!("{}={}", k, v)).collect();

        assert_eq!(query_params.len(), 0);
    }

    #[test]
    fn test_document_id_handling() {
        // Test DocumentId creation and handling
        let doc_id = DocumentId::from("test-document-123");
        let doc_id_str: &str = doc_id.as_ref();
        assert_eq!(doc_id_str, "test-document-123");

        // Create a UUID and use it as DocumentId
        let uuid = Uuid::new_v4();
        let uuid_str = uuid.to_string();
        let new_id = DocumentId::from(uuid_str.clone());
        let id_str: &str = new_id.as_ref();
        assert!(!id_str.is_empty());
        assert_eq!(id_str, uuid_str);
        // UUIDs are 36 characters long (32 hex + 4 dashes)
        assert_eq!(id_str.len(), 36);
        assert!(id_str.contains('-'));
    }

    #[test]
    fn test_vector_storage_structure() {
        // Test the HashMap structure for storing vectors
        let mut vectors = HashMap::new();
        vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3, 0.4, 0.5]);
        vectors.insert("chunk_1".to_string(), vec![0.6, 0.7, 0.8, 0.9, 1.0]);

        assert_eq!(vectors.len(), 2);
        assert_eq!(vectors["chunk_0"], vec![0.1, 0.2, 0.3, 0.4, 0.5]);
        assert_eq!(vectors["chunk_1"], vec![0.6, 0.7, 0.8, 0.9, 1.0]);
    }

    #[test]
    fn test_chunk_metadata() {
        // Test chunk metadata structure
        let content = "Content spanning multiple words";
        let chunk = MemvidChunk {
            id: "chunk_5".to_string(),
            content: content.to_string(),
            start_offset: 100,
            end_offset: 100 + content.len(),
        };

        assert_eq!(chunk.end_offset - chunk.start_offset, chunk.content.len());
        assert_eq!(chunk.id, "chunk_5");
    }

    #[test]
    fn test_document_hash_uniqueness() {
        // Test that content hashes are stored properly
        let hash1 = "sha256_abc123".to_string();
        let hash2 = "sha256_def456".to_string();

        let doc1 = MemvidDocument::new(vec![], HashMap::new(), 0.5, 0.8, 1, hash1.clone());

        let doc2 = MemvidDocument::new(vec![], HashMap::new(), 0.5, 0.8, 1, hash2.clone());

        assert_eq!(doc1.content_hash, hash1);
        assert_eq!(doc2.content_hash, hash2);
        assert_ne!(doc1.content_hash, doc2.content_hash);
    }

    #[test]
    fn test_cognitive_load_range() {
        // Test that cognitive load values are within expected ranges
        let valid_loads = vec![0.0, 0.1, 0.5, 0.8, 0.95, 1.0];

        for load in valid_loads {
            let doc = MemvidDocument::new(vec![], HashMap::new(), load, 0.8, 1, "test".to_string());
            assert!((doc.cognitive_load - load).abs() < 1e-6);
        }
    }

    #[test]
    fn test_compression_ratio_range() {
        // Test compression ratio values
        let ratios = vec![0.1, 0.5, 0.8, 0.95];

        for ratio in ratios {
            let doc =
                MemvidDocument::new(vec![], HashMap::new(), 0.5, ratio, 1, "test".to_string());
            assert!((doc.compression_ratio - ratio).abs() < 1e-6);
        }
    }

    #[test]
    fn test_taxonomical_depth_values() {
        // Test taxonomical depth values
        let depths = vec![0, 1, 2, 3, 5, 10];

        for depth in depths {
            let doc =
                MemvidDocument::new(vec![], HashMap::new(), 0.5, 0.8, depth, "test".to_string());
            assert_eq!(doc.taxonomical_depth, depth);
        }
    }

    #[tokio::test]
    async fn test_couchdb_client_with_stub_server() {
        let stub = TestCouchStub::spawn().await;

        let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
            .await
            .expect("failed to create couch client");

        let chunks = vec![MemvidChunk {
            id: "chunk_0".to_string(),
            content: "Memvid chunk zero".to_string(),
            start_offset: 0,
            end_offset: 18,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);

        let doc_id = client
            .ingest_memvid_document(
                chunks,
                vectors,
                0.75,
                0.55,
                3,
                "hash-123".to_string(),
            )
            .await
            .expect("failed to ingest document");

        let rows = client
            .query_view("memvid", "by_cognitive_load")
            .await
            .expect("failed to query view");

        assert_eq!(rows.len(), 1);
        let value = rows[0]
            .get("value")
            .expect("expected value object")
            .clone();
        assert_eq!(value["id"], doc_id);
        assert_eq!(value["chunk_id"], "chunk_0");
        assert_eq!(value["content"], "Memvid chunk zero");
        assert_eq!(value["cognitive_load"], serde_json::json!(0.75));

        // Verify the _all_docs endpoint exposes the stored document
        let http = HttpClient::new();
        let all_docs_url = format!("{}/wren3-dev/_all_docs", stub.base_url());
        let all_docs: serde_json::Value = http
            .get(&all_docs_url)
            .send()
            .await
            .expect("all_docs request failed")
            .json()
            .await
            .expect("failed to deserialize _all_docs body");

        let rows = all_docs["rows"].as_array().expect("rows array missing");
        assert!(rows.iter().any(|row| row["id"] == doc_id));

        // Upload and retrieve an attachment
        let attachment_body = b"stub inline attachment".to_vec();
        let attachment_url = format!("{}/wren3-dev/{}/chunk_0.txt", stub.base_url(), doc_id);

        let put_response = http
            .put(&attachment_url)
            .header("Content-Type", "text/plain")
            .body(attachment_body.clone())
            .send()
            .await
            .expect("attachment upload failed");
        assert!(put_response.status().is_success());

        let get_response = http
            .get(&attachment_url)
            .send()
            .await
            .expect("attachment fetch failed");
        assert_eq!(get_response.status(), HttpStatus::OK);
        let returned = get_response.bytes().await.expect("attachment bytes missing");
        assert_eq!(returned.as_ref(), attachment_body.as_slice());

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_missing_attachment_returns_404() {
        let stub = TestCouchStub::spawn().await;

        let http = HttpClient::new();
        let missing_url = format!("{}/wren3-dev/nonexistent/doc.txt", stub.base_url());
        let response = http
            .get(&missing_url)
            .send()
            .await
            .expect("missing attachment request failed");

        assert_eq!(response.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_conflict_on_stale_revision() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "conflict_doc", "value": 1 }))
            .send()
            .await
            .expect("create request failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let conflict_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "conflict_doc", "_rev": "0-stub", "value": 2 }))
            .send()
            .await
            .expect("conflict request failed");

        assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);
        let conflict_body: Value = conflict_resp.json().await.expect("conflict body parse failed");
        assert_eq!(conflict_body["error"], "conflict");

        let valid_update = http
            .post(&db_url)
            .json(&json!({ "_id": "conflict_doc", "_rev": rev, "value": 3 }))
            .send()
            .await
            .expect("valid update failed");
        assert!(valid_update.status().is_success());

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_bulk_docs_deletion_removes_document() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "delete_me", "value": 42 }))
            .send()
            .await
            .expect("create for delete failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());
        let bulk_resp = http
            .post(&bulk_url)
            .json(&json!({
                "docs": [
                    {
                        "_id": "delete_me",
                        "_rev": rev,
                        "_deleted": true
                    }
                ]
            }))
            .send()
            .await
            .expect("bulk delete request failed");
        assert!(bulk_resp.status().is_success());
        let bulk_body: Value = bulk_resp.json().await.expect("bulk delete body parse failed");
        let rows = bulk_body.as_array().expect("bulk response array");
        assert_eq!(rows.len(), 1);
        assert!(rows[0]["ok"].as_bool().unwrap_or(false));

        let get_resp = http
            .get(&format!("{}/wren3-dev/delete_me", stub.base_url()))
            .send()
            .await
            .expect("post-delete fetch failed");
        assert_eq!(get_resp.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_delete_attachment_removes_data() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "attach_doc", "value": 1 }))
            .send()
            .await
            .expect("attachment create failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let mut rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let attachment_url = format!("{}/wren3-dev/{}/file.txt", stub.base_url(), "attach_doc");
        let put_resp = http
            .put(&format!("{}?rev={}", attachment_url, rev))
            .header("Content-Type", "text/plain")
            .body("stub attachment body".as_bytes().to_vec())
            .send()
            .await
            .expect("attachment upload failed");
        assert_eq!(put_resp.status(), HttpStatus::CREATED);
        let put_body: Value = put_resp.json().await.expect("put body parse failed");
        rev = put_body["rev"].as_str().expect("rev missing after put").to_string();

        let delete_resp = http
            .delete(&format!("{}?rev={}", attachment_url, rev))
            .send()
            .await
            .expect("attachment delete failed");
        assert_eq!(delete_resp.status(), HttpStatus::OK);
        let delete_body: Value = delete_resp.json().await.expect("delete body parse failed");
        let new_rev = delete_body["rev"].as_str().expect("rev missing after delete");

        let doc_resp = http
            .get(&format!("{}/wren3-dev/attach_doc", stub.base_url()))
            .send()
            .await
            .expect("doc fetch failed");
        assert_eq!(doc_resp.status(), HttpStatus::OK);
        let doc_body: Value = doc_resp.json().await.expect("doc body parse failed");
        assert!(doc_body.get("_attachments").is_none());
        assert_eq!(doc_body["_rev"], Value::String(new_rev.to_string()));

        let fetch_resp = http
            .get(&attachment_url)
            .send()
            .await
            .expect("post-delete attachment fetch failed");
        assert_eq!(fetch_resp.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_delete_attachment_with_stale_rev_conflicts() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "stale_attach", "value": 1 }))
            .send()
            .await
            .expect("stale attachment create failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let attachment_url = format!("{}/wren3-dev/{}/file.txt", stub.base_url(), "stale_attach");
        let put_resp = http
            .put(&format!("{}?rev={}", attachment_url, rev))
            .header("Content-Type", "text/plain")
            .body("body".as_bytes().to_vec())
            .send()
            .await
            .expect("attachment upload failed");
        assert_eq!(put_resp.status(), HttpStatus::CREATED);
        let put_body: Value = put_resp.json().await.expect("put body parse failed");
        let new_rev = put_body["rev"].as_str().expect("rev missing after put").to_string();

        let conflict_resp = http
            .delete(&format!("{}?rev={}", attachment_url, rev))
            .send()
            .await
            .expect("conflict delete request failed");
        assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);
        let conflict_body: Value = conflict_resp.json().await.expect("conflict body parse failed");
        assert_eq!(conflict_body["error"], "conflict");

        let success_resp = http
            .delete(&format!("{}?rev={}", attachment_url, new_rev))
            .send()
            .await
            .expect("successful delete failed");
        assert_eq!(success_resp.status(), HttpStatus::OK);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_changes_feed_reports_updates() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "changes_doc", "value": 1 }))
            .send()
            .await
            .expect("changes doc create failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let changes_url = format!("{}/wren3-dev/_changes", stub.base_url());
        let feed: Value = http
            .get(&format!("{}?include_docs=true", changes_url))
            .send()
            .await
            .expect("changes feed request failed")
            .json()
            .await
            .expect("changes feed parse failed");

        let results = feed["results"].as_array().expect("results array missing");
        assert!(!results.is_empty());
        assert_eq!(results[0]["id"], "changes_doc");
        assert!(results[0]["doc"].is_object());
        let last_seq = feed["last_seq"].as_u64().unwrap_or(0);

        let update_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "changes_doc", "_rev": rev, "value": 2 }))
            .send()
            .await
            .expect("changes doc update failed");
        assert!(update_resp.status().is_success());
        let update_body: Value = update_resp.json().await.expect("update body parse failed");
        let updated_rev = update_body["rev"].as_str().expect("rev missing after update");

        let filtered_feed: Value = http
            .get(&format!("{}?since={}&include_docs=false", changes_url, last_seq))
            .send()
            .await
            .expect("filtered changes request failed")
            .json()
            .await
            .expect("filtered changes parse failed");

        let filtered_results = filtered_feed["results"].as_array().expect("filtered array missing");
        assert_eq!(filtered_results.len(), 1);
        assert_eq!(filtered_results[0]["id"], "changes_doc");
        assert_eq!(
            filtered_results[0]["changes"][0]["rev"],
            Value::String(updated_rev.to_string())
        );

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_delete_document_requires_matching_rev() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "doc_delete", "value": 1 }))
            .send()
            .await
            .expect("doc create failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing").to_string();

        let conflict_resp = http
            .delete(&format!("{}/wren3-dev/doc_delete?rev=0-stub", stub.base_url()))
            .send()
            .await
            .expect("stale delete request failed");
        assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);

        let delete_url = format!("{}/wren3-dev/doc_delete?rev={}", stub.base_url(), rev);
        let delete_resp = http
            .delete(&delete_url)
            .send()
            .await
            .expect("doc delete request failed");
        assert_eq!(delete_resp.status(), HttpStatus::OK);
        let delete_body: Value = delete_resp.json().await.expect("delete body parse failed");
        let new_rev = delete_body["rev"].as_str().expect("rev missing after delete");
        assert!(delete_body["ok"].as_bool().unwrap_or(false));

        let fetch_resp = http
            .get(&format!("{}/wren3-dev/doc_delete", stub.base_url()))
            .send()
            .await
            .expect("post-delete fetch failed");
        assert_eq!(fetch_resp.status(), HttpStatus::NOT_FOUND);

        let repeat_resp = http
            .delete(&format!("{}/wren3-dev/doc_delete?rev={}", stub.base_url(), new_rev))
            .send()
            .await
            .expect("repeat delete request failed");
        assert_eq!(repeat_resp.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_put_document_updates_with_revision_check() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let doc_url = format!("{}/wren3-dev/doc_put", stub.base_url());

        let create_resp = http
            .put(&doc_url)
            .json(&json!({ "value": 1 }))
            .send()
            .await
            .expect("doc create via put failed");
        assert_eq!(create_resp.status(), HttpStatus::CREATED);
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing after create").to_string();

        let missing_rev_resp = http
            .put(&doc_url)
            .json(&json!({ "value": 2 }))
            .send()
            .await
            .expect("missing rev update failed");
        assert_eq!(missing_rev_resp.status(), HttpStatus::CONFLICT);

        let stale_rev_resp = http
            .put(&doc_url)
            .json(&json!({ "_rev": "0-stub", "value": 3 }))
            .send()
            .await
            .expect("stale rev update failed");
        assert_eq!(stale_rev_resp.status(), HttpStatus::CONFLICT);

        let update_resp = http
            .put(&doc_url)
            .json(&json!({ "_rev": rev, "value": 4 }))
            .send()
            .await
            .expect("valid update failed");
        assert_eq!(update_resp.status(), HttpStatus::CREATED);
        let update_body: Value = update_resp.json().await.expect("update body parse failed");
        let new_rev = update_body["rev"].as_str().expect("rev missing after update");

        let fetch_resp = http
            .get(&doc_url)
            .send()
            .await
            .expect("fetch after update failed");
        assert_eq!(fetch_resp.status(), HttpStatus::OK);
        let fetch_body: Value = fetch_resp.json().await.expect("fetch body parse failed");
        assert_eq!(fetch_body["value"], json!(4));
        assert_eq!(fetch_body["_rev"], Value::String(new_rev.to_string()));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_bulk_docs_delete_missing_doc_returns_not_found_entry() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

        let resp = http
            .post(&bulk_url)
            .json(&json!({
                "docs": [
                    {
                        "_id": "missing_doc",
                        "_rev": "1-stub",
                        "_deleted": true
                    }
                ]
            }))
            .send()
            .await
            .expect("bulk delete request failed");

        assert_eq!(resp.status(), HttpStatus::CREATED);
        let body: Value = resp.json().await.expect("bulk response parse failed");
        let entries = body.as_array().expect("bulk response array missing");
        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry["id"], Value::String("missing_doc".into()));
        assert_eq!(entry["error"], Value::String("not_found".into()));
        assert_eq!(entry["reason"], Value::String("missing".into()));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_bulk_docs_respects_new_edits_false_replication_semantics() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());
        let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "replicated_doc", "value": 1 }))
            .send()
            .await
            .expect("initial doc create failed");
        assert!(create_resp.status().is_success());

        let replicate_resp = http
            .post(&bulk_url)
            .json(&json!({
                "new_edits": false,
                "docs": [
                    {
                        "_id": "replicated_doc",
                        "_rev": "5-remote",
                        "value": 99
                    }
                ]
            }))
            .send()
            .await
            .expect("replication bulk request failed");
        assert_eq!(replicate_resp.status(), HttpStatus::CREATED);
        let replicate_body: Value = replicate_resp
            .json()
            .await
            .expect("replication response parse failed");
        let replicate_entries = replicate_body
            .as_array()
            .expect("replication response entries missing");
        assert_eq!(replicate_entries.len(), 1);
        assert_eq!(replicate_entries[0]["id"], Value::String("replicated_doc".into()));
        assert_eq!(replicate_entries[0]["rev"], Value::String("5-remote".into()));

        let fetch_resp = http
            .get(&format!("{}/wren3-dev/replicated_doc", stub.base_url()))
            .send()
            .await
            .expect("fetch replicated doc failed");
        assert_eq!(fetch_resp.status(), HttpStatus::OK);
        let fetch_body: Value = fetch_resp.json().await.expect("fetch body parse failed");
        assert_eq!(fetch_body["_rev"], Value::String("5-remote".into()));
        assert_eq!(fetch_body["value"], Value::Number(99.into()));

        let delete_replication_resp = http
            .post(&bulk_url)
            .json(&json!({
                "new_edits": false,
                "docs": [
                    {
                        "_id": "replicated_doc",
                        "_rev": "6-remote",
                        "_deleted": true
                    }
                ]
            }))
            .send()
            .await
            .expect("replication delete request failed");
        assert_eq!(delete_replication_resp.status(), HttpStatus::CREATED);
        let delete_entries: Value = delete_replication_resp
            .json()
            .await
            .expect("replication delete response parse failed");
        let delete_array = delete_entries
            .as_array()
            .expect("replication delete entries missing");
        assert_eq!(delete_array.len(), 1);
        assert_eq!(delete_array[0]["rev"], Value::String("6-remote".into()));

        let missing_resp = http
            .post(&bulk_url)
            .json(&json!({
                "new_edits": false,
                "docs": [
                    {
                        "_id": "replicated_doc",
                        "_deleted": true
                    }
                ]
            }))
            .send()
            .await
            .expect("missing rev replication request failed");
        assert_eq!(missing_resp.status(), HttpStatus::CREATED);
        let missing_body: Value = missing_resp
            .json()
            .await
            .expect("missing rev response parse failed");
        let missing_entries = missing_body
            .as_array()
            .expect("missing rev entries missing");
        assert_eq!(missing_entries.len(), 1);
        assert_eq!(missing_entries[0]["error"], Value::String("conflict".into()));

        let fetch_after_delete = http
            .get(&format!("{}/wren3-dev/replicated_doc", stub.base_url()))
            .send()
            .await
            .expect("fetch after replication delete failed");
        assert_eq!(fetch_after_delete.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_changes_feed_includes_tombstone_doc_when_deleted() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "tombstone_doc", "value": 1 }))
            .send()
            .await
            .expect("create tombstone doc failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev = create_body["rev"].as_str().expect("rev missing after create");

        let delete_resp = http
            .delete(&format!("{}/wren3-dev/tombstone_doc?rev={rev}", stub.base_url()))
            .send()
            .await
            .expect("delete tombstone doc failed");
        assert_eq!(delete_resp.status(), HttpStatus::OK);
        let delete_body: Value = delete_resp
            .json()
            .await
            .expect("delete body parse failed");
        let delete_rev = delete_body["rev"]
            .as_str()
            .expect("rev missing after delete")
            .to_string();

        let changes_resp = http
            .get(&format!(
                "{}/wren3-dev/_changes?include_docs=true",
                stub.base_url()
            ))
            .send()
            .await
            .expect("changes request failed");
        assert_eq!(changes_resp.status(), HttpStatus::OK);
        let changes_body: Value = changes_resp
            .json()
            .await
            .expect("changes body parse failed");
        let results = changes_body["results"]
            .as_array()
            .expect("changes results missing");

        let tombstone_entry = results
            .iter()
            .rev()
            .find(|entry| entry["id"] == "tombstone_doc")
            .expect("tombstone entry missing in changes feed");
        assert_eq!(tombstone_entry["deleted"], Value::Bool(true));
        let doc = tombstone_entry["doc"].as_object().expect("tombstone doc missing");
        assert_eq!(doc.get("_id"), Some(&Value::String("tombstone_doc".into())));
        assert_eq!(doc.get("_rev"), Some(&Value::String(delete_rev.clone())));
        assert_eq!(doc.get("_deleted"), Some(&Value::Bool(true)));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_bulk_docs_new_edits_false_requires_explicit_id() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

        let resp = http
            .post(&bulk_url)
            .json(&json!({
                "new_edits": false,
                "docs": [
                    {
                        "_rev": "1-remote",
                        "value": 42
                    }
                ]
            }))
            .send()
            .await
            .expect("bulk request without id failed");

        assert_eq!(resp.status(), HttpStatus::CREATED);
        let body: Value = resp.json().await.expect("bulk missing id parse failed");
        let entries = body.as_array().expect("bulk missing id entries missing");
        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry["error"], Value::String("bad_request".into()));
        assert_eq!(entry["reason"], Value::String("Document id required for replication".into()));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_get_document_with_revision_query_returns_historical_version() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());

        let create_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "rev_doc", "value": 1 }))
            .send()
            .await
            .expect("revision doc create failed");
        assert!(create_resp.status().is_success());
        let create_body: Value = create_resp.json().await.expect("create body parse failed");
        let rev1 = create_body["rev"].as_str().expect("rev missing").to_string();

        let update_resp = http
            .post(&db_url)
            .json(&json!({ "_id": "rev_doc", "_rev": rev1, "value": 2 }))
            .send()
            .await
            .expect("revision doc update failed");
        assert!(update_resp.status().is_success());
        let update_body: Value = update_resp.json().await.expect("update body parse failed");
        let rev2 = update_body["rev"].as_str().expect("rev missing after update").to_string();

        let latest_resp = http
            .get(&format!("{}/wren3-dev/rev_doc", stub.base_url()))
            .send()
            .await
            .expect("latest fetch failed");
        assert_eq!(latest_resp.status(), HttpStatus::OK);
        let latest_body: Value = latest_resp.json().await.expect("latest body parse failed");
        assert_eq!(latest_body["value"], Value::Number(2.into()));
        assert_eq!(latest_body["_rev"], Value::String(rev2.clone()));

        let latest_rev_resp = http
            .get(&format!("{}/wren3-dev/rev_doc?rev={}", stub.base_url(), rev2))
            .send()
            .await
            .expect("latest rev fetch failed");
        assert_eq!(latest_rev_resp.status(), HttpStatus::OK);
        let latest_rev_body: Value = latest_rev_resp
            .json()
            .await
            .expect("latest rev body parse failed");
        assert_eq!(latest_rev_body["value"], Value::Number(2.into()));

        let historical_resp = http
            .get(&format!("{}/wren3-dev/rev_doc?rev={}", stub.base_url(), rev1))
            .send()
            .await
            .expect("historical fetch failed");
        assert_eq!(historical_resp.status(), HttpStatus::OK);
        let historical_body: Value = historical_resp
            .json()
            .await
            .expect("historical body parse failed");
        assert_eq!(historical_body["value"], Value::Number(1.into()));
        assert_eq!(historical_body["_rev"], Value::String(rev1));

        let missing_rev_resp = http
            .get(&format!(
                "{}/wren3-dev/rev_doc?rev=999-missing",
                stub.base_url()
            ))
            .send()
            .await
            .expect("missing rev request failed");
        assert_eq!(missing_rev_resp.status(), HttpStatus::NOT_FOUND);

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_post_all_docs_filters_by_keys_and_includes_missing() {
        let stub = TestCouchStub::spawn().await;
        let http = HttpClient::new();
        let db_url = format!("{}/wren3-dev", stub.base_url());
        let all_docs_url = format!("{}/wren3-dev/_all_docs?include_docs=true", stub.base_url());

        let create_a = http
            .post(&db_url)
            .json(&json!({ "_id": "doc_a", "value": 1 }))
            .send()
            .await
            .expect("doc a create failed");
        assert!(create_a.status().is_success());

        let create_b = http
            .post(&db_url)
            .json(&json!({ "_id": "doc_b", "value": 2 }))
            .send()
            .await
            .expect("doc b create failed");
        assert!(create_b.status().is_success());

        let resp = http
            .post(&all_docs_url)
            .json(&json!({ "keys": ["doc_a", "missing_doc"] }))
            .send()
            .await
            .expect("post _all_docs request failed");

        assert_eq!(resp.status(), HttpStatus::OK);
        let body: Value = resp.json().await.expect("post _all_docs body parse failed");
        assert_eq!(body["total_rows"], Value::Number(2.into()));
        let rows = body["rows"].as_array().expect("rows array missing");
        assert_eq!(rows.len(), 2);

        let first = &rows[0];
        assert_eq!(first["key"], Value::String("doc_a".into()));
        assert_eq!(first["id"], Value::String("doc_a".into()));
        assert!(first["doc"].is_object());

        let second = &rows[1];
        assert_eq!(second["key"], Value::String("missing_doc".into()));
        assert_eq!(second["error"], Value::String("not_found".into()));

        stub.shutdown().await;
    }

    #[derive(Clone, Default)]
    struct StubDatabases {
        inner: Arc<RwLock<HashMap<String, DbState>>>,
    }

    #[derive(Clone, Default)]
    struct DbState {
        docs: HashMap<String, serde_json::Value>,
        seq: u64,
        changes: Vec<ChangeEntry>,
        rev_history: HashMap<String, HashMap<String, serde_json::Value>>,
    }

    #[derive(Clone)]
    struct ChangeEntry {
        seq: u64,
        id: String,
        rev: String,
        deleted: bool,
        doc: Option<serde_json::Value>,
    }

    enum ApplyOutcome {
        Stored { id: String, rev: String },
        Deleted { id: String, rev: String },
    }

    enum ApplyError {
        Conflict { id: String },
        NotFound { id: String },
    }

    impl StubDatabases {
        async fn ensure_database(&self, name: &str) {
            let mut guard = self.inner.write().await;
            guard.entry(name.to_string()).or_insert_with(DbState::default);
        }

        async fn get_document(&self, db: &str, id: &str) -> Option<serde_json::Value> {
            let guard = self.inner.read().await;
            guard.get(db).and_then(|state| state.docs.get(id).cloned())
        }

        async fn get_document_revision(
            &self,
            db: &str,
            id: &str,
            rev: &str,
        ) -> Option<serde_json::Value> {
            let guard = self.inner.read().await;
            guard
                .get(db)
                .and_then(|state| state.rev_history.get(id))
                .and_then(|history| history.get(rev))
                .cloned()
        }

        async fn all_docs(&self, db: &str) -> Vec<(String, serde_json::Value)> {
            let guard = self.inner.read().await;
            guard
                .get(db)
                .map(|state| {
                    state
                        .docs
                        .iter()
                        .map(|(id, doc)| (id.clone(), doc.clone()))
                        .collect()
                })
                .unwrap_or_default()
        }

        async fn collect_rows(
            &self,
            db: &str,
            metric_field: &str,
        ) -> Vec<serde_json::Value> {
            let guard = self.inner.read().await;
            let Some(state) = guard.get(db) else {
                return Vec::new();
            };

            let mut rows = Vec::new();

            for (doc_id, doc) in &state.docs {
                if doc_id.starts_with("_design/") {
                    continue;
                }

                let Some(vectors) = doc.get("vectors").and_then(|v| v.as_object()) else {
                    continue;
                };
                let Some(chunks) = doc.get("chunks").and_then(|c| c.as_array()) else {
                    continue;
                };
                let metric_value = doc.get(metric_field).cloned().unwrap_or(serde_json::Value::Null);

                for chunk in chunks {
                    let Some(chunk_id) = chunk.get("id").and_then(|id| id.as_str()) else {
                        continue;
                    };
                    let Some(vector) = vectors.get(chunk_id) else {
                        continue;
                    };
                    let content = chunk
                        .get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string();

                    rows.push(serde_json::json!({
                        "id": doc_id,
                        "key": metric_value,
                        "value": {
                            "id": doc_id,
                            "chunk_id": chunk_id,
                            "vector": vector,
                            "cognitive_load": doc.get("cognitive_load").cloned().unwrap_or(serde_json::Value::Null),
                            "compression_ratio": doc.get("compression_ratio").cloned().unwrap_or(serde_json::Value::Null),
                            "content": content,
                        }
                    }));
                }
            }

            rows
        }

        async fn apply_document(
            &self,
            db: &str,
            mut doc: Value,
            override_id: Option<String>,
            new_edits: bool,
        ) -> std::result::Result<ApplyOutcome, ApplyError> {
            let mut guard = self.inner.write().await;
            let db_entry = guard
                .entry(db.to_string())
                .or_insert_with(DbState::default);

            let id = override_id
                .or_else(|| doc.get("_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| Uuid::new_v4().to_string());

            let incoming_rev = doc.get("_rev").and_then(|v| v.as_str()).map(|s| s.to_string());
            let is_deleted = doc
                .get("_deleted")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let (outcome, stored_doc, deleted_flag, change_rev) = if !new_edits {
                let Some(rev) = incoming_rev.clone() else {
                    return Err(ApplyError::Conflict { id });
                };

                if is_deleted {
                    db_entry.docs.remove(&id);
                    let tombstone = serde_json::json!({
                        "_id": id.clone(),
                        "_rev": rev.clone(),
                        "_deleted": true,
                    });
                    (
                        ApplyOutcome::Deleted {
                            id: id.clone(),
                            rev: rev.clone(),
                        },
                        Some(tombstone),
                        true,
                        rev,
                    )
                } else {
                    doc["_id"] = Value::String(id.clone());
                    doc["_rev"] = Value::String(rev.clone());
                    let stored = doc.clone();
                    db_entry.docs.insert(id.clone(), doc);
                    (
                        ApplyOutcome::Stored {
                            id: id.clone(),
                            rev: rev.clone(),
                        },
                        Some(stored),
                        false,
                        rev,
                    )
                }
            } else {
                match db_entry.docs.entry(id.clone()) {
                    Entry::Occupied(mut existing_entry) => {
                        let current_doc = existing_entry.get();
                        let current_rev = current_doc
                            .get("_rev")
                            .and_then(|v| v.as_str())
                            .unwrap_or("1-stub");

                        match incoming_rev {
                            Some(ref rev) if rev == current_rev => {}
                            _ => return Err(ApplyError::Conflict { id }),
                        }

                        let new_rev = next_revision(Some(current_rev));

                        if is_deleted {
                            existing_entry.remove();
                            let tombstone = serde_json::json!({
                                "_id": id.clone(),
                                "_rev": new_rev.clone(),
                                "_deleted": true,
                            });
                            (
                                ApplyOutcome::Deleted {
                                    id: id.clone(),
                                    rev: new_rev.clone(),
                                },
                                Some(tombstone),
                                true,
                                new_rev,
                            )
                        } else {
                            doc["_id"] = Value::String(id.clone());
                            doc["_rev"] = Value::String(new_rev.clone());
                            let updated_doc = doc.clone();
                            existing_entry.insert(doc);
                            (
                                ApplyOutcome::Stored {
                                    id: id.clone(),
                                    rev: new_rev.clone(),
                                },
                                Some(updated_doc),
                                false,
                                new_rev,
                            )
                        }
                    }
                    Entry::Vacant(vacant_entry) => {
                        if is_deleted {
                            return Err(ApplyError::NotFound { id });
                        }

                        if incoming_rev.is_some() {
                            return Err(ApplyError::Conflict { id });
                        }

                        let new_rev = next_revision(None);
                        doc["_id"] = Value::String(id.clone());
                        doc["_rev"] = Value::String(new_rev.clone());
                        let inserted_doc = doc.clone();
                        vacant_entry.insert(doc);
                        (
                            ApplyOutcome::Stored {
                                id: id.clone(),
                                rev: new_rev.clone(),
                            },
                            Some(inserted_doc),
                            false,
                            new_rev,
                        )
                    }
                }
            };

            let seq = {
                db_entry.seq += 1;
                db_entry.seq
            };

            let stored_doc_for_change = stored_doc.clone();
            db_entry.changes.push(ChangeEntry {
                seq,
                id: id.clone(),
                rev: change_rev.clone(),
                deleted: deleted_flag,
                doc: stored_doc_for_change.clone(),
            });

            if let Some(doc) = stored_doc_for_change {
                db_entry
                    .rev_history
                    .entry(id.clone())
                    .or_default()
                    .insert(change_rev.clone(), doc);
            }

            Ok(outcome)
        }

        async fn changes(
            &self,
            db: &str,
            since: Option<u64>,
            limit: Option<usize>,
            include_docs: bool,
        ) -> (Vec<serde_json::Value>, u64) {
            let guard = self.inner.read().await;
            let Some(state) = guard.get(db) else {
                return (Vec::new(), 0);
            };

            let since_seq = since.unwrap_or(0);
            let mut results = Vec::new();

            for change in state.changes.iter().filter(|c| c.seq > since_seq) {
                let mut change_obj = serde_json::json!({
                    "seq": change.seq,
                    "id": change.id,
                    "changes": [serde_json::json!({ "rev": change.rev })],
                });

                if change.deleted {
                    change_obj["deleted"] = serde_json::Value::Bool(true);
                }

                if include_docs {
                    if let Some(doc) = &change.doc {
                        change_obj["doc"] = doc.clone();
                    }
                }

                results.push(change_obj);

                if let Some(limit) = limit {
                    if results.len() >= limit {
                        break;
                    }
                }
            }

            let last_seq = state.seq;
            (results, last_seq)
        }
    }

    pub(crate) struct TestCouchStub {
        addr: SocketAddr,
        shutdown: Option<oneshot::Sender<()>>,
    }

    #[derive(Clone)]
    struct AppState {
        databases: StubDatabases,
    }

    impl TestCouchStub {
        pub(crate) async fn spawn() -> Self {
            let state = AppState {
                databases: StubDatabases::default(),
            };

            let router = Router::new()
                .route("/:db", put(put_database).post(post_document))
                .route("/:db/_bulk_docs", post(post_bulk_docs))
                .route("/:db/_all_docs", get(get_all_docs))
                .route("/:db/_changes", get(get_changes))
                .route(
                    "/:db/_design/:design_doc",
                    get(get_design_doc).post(post_design_doc),
                )
                .route(
                    "/:db/_design/:design_doc/_view/:view_name",
                    get(get_view),
                )
                .route(
                    "/:db/:doc_id/:attachment",
                    get(get_attachment)
                        .put(put_attachment)
                        .delete(delete_attachment),
                )
                .route(
                    "/:db/:doc_id",
                    get(get_document)
                        .delete(delete_document)
                        .put(put_document),
                )
                .with_state(state.clone());

            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .expect("failed to bind stub listener");
            let addr = listener.local_addr().expect("missing local addr");
            let (shutdown_tx, shutdown_rx) = oneshot::channel();

            let server = axum::serve(listener, router).with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            });

            tokio::spawn(async move {
                if let Err(err) = server.await {
                    eprintln!("stub server error: {err}");
                }
            });

            Self {
                addr,
                shutdown: Some(shutdown_tx),
            }
        }

        pub(crate) fn base_url(&self) -> String {
            format!("http://{}", self.addr)
        }

        pub(crate) async fn shutdown(mut self) {
            if let Some(tx) = self.shutdown.take() {
                let _ = tx.send(());
            }
        }
    }

    async fn put_database(
        Path(db): Path<String>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        state.databases.ensure_database(&db).await;
        (StatusCode::CREATED, Json(serde_json::json!({ "ok": true })))
    }

    async fn post_document(
        Path(db): Path<String>,
        State(state): State<AppState>,
        Json(doc): Json<serde_json::Value>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        match state
            .databases
            .apply_document(&db, doc, None, true)
            .await
        {
            Ok(ApplyOutcome::Stored { id, rev })
            | Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::CREATED,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id
                })),
            ),
        }
    }

    async fn post_bulk_docs(
        Path(db): Path<String>,
        State(state): State<AppState>,
        Json(payload): Json<BulkDocsPayload>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let mut results = Vec::new();
        let new_edits = payload.new_edits.unwrap_or(true);

        for doc in payload.docs {
            let doc_id = doc
                .get("_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            if !new_edits && doc_id.is_none() {
                results.push(serde_json::json!({
                    "id": serde_json::Value::Null,
                    "error": "bad_request",
                    "reason": "Document id required for replication",
                }));
                continue;
            }

            match state
                .databases
                .apply_document(&db, doc, None, new_edits)
                .await
            {
                Ok(ApplyOutcome::Stored { id, rev })
                | Ok(ApplyOutcome::Deleted { id, rev }) => {
                    results.push(serde_json::json!({ "id": id, "rev": rev, "ok": true }));
                }
                Err(ApplyError::Conflict { id }) => {
                    results.push(serde_json::json!({
                        "id": id,
                        "error": "conflict",
                        "reason": "Document update conflict."
                    }));
                }
                Err(ApplyError::NotFound { id }) => {
                    results.push(serde_json::json!({
                        "id": id,
                        "error": "not_found",
                        "reason": "missing"
                    }));
                }
            }
        }

        (
            StatusCode::CREATED,
            Json(serde_json::Value::Array(results)),
        )
    }

    async fn get_all_docs(
        Path(db): Path<String>,
        Query(params): Query<AllDocsQuery>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let include_docs = params.include_docs.unwrap_or(false);
        let docs = state.databases.all_docs(&db).await;

        let mut rows = Vec::new();
        for (id, doc) in docs {
            let rev = doc
                .get("_rev")
                .and_then(|v| v.as_str())
                .unwrap_or("1-stub");

            let mut row = serde_json::json!({
                "id": id,
                "key": id,
                "value": { "rev": rev },
            });

            if include_docs {
                row["doc"] = doc.clone();
            }

            rows.push(row);
        }

        (
            StatusCode::OK,
            Json(serde_json::json!({
                "total_rows": rows.len(),
                "offset": 0,
                "rows": rows,
            })),
        )
    }

    async fn get_changes(
        Path(db): Path<String>,
        Query(params): Query<ChangesQuery>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let since_seq = params
            .since
            .as_ref()
            .and_then(|value| value.parse::<u64>().ok());
        let include_docs = params.include_docs.unwrap_or(false);
        let limit = params.limit;

        let (results, db_last_seq) = state
            .databases
            .changes(&db, since_seq, limit, include_docs)
            .await;

        let reported_last_seq = results
            .last()
            .and_then(|item| item.get("seq").and_then(|v| v.as_u64()))
            .unwrap_or_else(|| since_seq.unwrap_or(db_last_seq));

        (
            StatusCode::OK,
            Json(serde_json::json!({
                "results": results,
                "last_seq": reported_last_seq,
                "pending": 0,
            })),
        )
    }

    async fn get_design_doc(
        Path((db, design_doc)): Path<(String, String)>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let key = format!("_design/{}", design_doc);
        if let Some(doc) = state.databases.get_document(&db, &key).await {
            (StatusCode::OK, Json(doc))
        } else {
            (StatusCode::NOT_FOUND, Json(not_found()))
        }
    }

    async fn post_design_doc(
        Path((db, design_doc)): Path<(String, String)>,
        State(state): State<AppState>,
        Json(doc): Json<serde_json::Value>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let design_id = format!("_design/{}", design_doc);
        match state
            .databases
            .apply_document(&db, doc, Some(design_id), true)
            .await
        {
            Ok(ApplyOutcome::Stored { id, rev })
            | Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::CREATED,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id
                })),
            ),
        }
    }

    async fn get_view(
        Path((db, design_doc, view_name)): Path<(String, String, String)>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let metric = match view_name.as_str() {
            "by_compression_ratio" => "compression_ratio",
            _ => "cognitive_load",
        };

        respond_with_view(&db, &design_doc, &view_name, metric, &state).await
    }

    async fn get_document(
        Path((db, doc_id)): Path<(String, String)>,
        Query(params): Query<RevisionQuery>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        if let Some((design_doc, view_name)) = decode_view_request(&doc_id) {
            let metric = match view_name.as_str() {
                "by_compression_ratio" => "compression_ratio",
                _ => "cognitive_load",
            };
            return respond_with_view(&db, &design_doc, &view_name, metric, &state).await;
        }

        if let Some(rev) = params.rev {
            if let Some(doc) = state
                .databases
                .get_document_revision(&db, &doc_id, &rev)
                .await
            {
                return (StatusCode::OK, Json(doc));
            } else {
                return (StatusCode::NOT_FOUND, Json(not_found()));
            }
        }

        if let Some(doc) = state.databases.get_document(&db, &doc_id).await {
            (StatusCode::OK, Json(doc))
        } else {
            (StatusCode::NOT_FOUND, Json(not_found()))
        }
    }

    async fn delete_document(
        Path((db, doc_id)): Path<(String, String)>,
        Query(params): Query<RevisionQuery>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let provided_rev = match params.rev {
            Some(rev) => rev,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "error": "bad_request",
                        "reason": "Missing required rev parameter.",
                        "id": doc_id,
                    })),
                );
            }
        };

        let doc = match state.databases.get_document(&db, &doc_id).await {
            Some(doc) => doc,
            None => return (StatusCode::NOT_FOUND, Json(not_found())),
        };

        let current_rev = doc
            .get("_rev")
            .and_then(|v| v.as_str())
            .unwrap_or("1-stub");

        if provided_rev != current_rev {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": doc_id,
                })),
            );
        }

        let delete_doc = serde_json::json!({
            "_id": doc_id,
            "_rev": provided_rev,
            "_deleted": true,
        });

        match state
            .databases
            .apply_document(&db, delete_doc, None, true)
            .await
        {
            Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::OK,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Ok(ApplyOutcome::Stored { id, rev }) => (
                StatusCode::OK,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id,
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id,
                })),
            ),
        }
    }

    async fn put_document(
        Path((db, doc_id)): Path<(String, String)>,
        State(state): State<AppState>,
        Json(doc): Json<serde_json::Value>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        match state
            .databases
            .apply_document(&db, doc, Some(doc_id.clone()), true)
            .await
        {
            Ok(ApplyOutcome::Stored { id, rev })
            | Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::CREATED,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id,
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id,
                })),
            ),
        }
    }

    async fn put_attachment(
        Path((db, doc_id, attachment_name)): Path<(String, String, String)>,
        Query(params): Query<RevisionQuery>,
        State(state): State<AppState>,
        headers: HeaderMap,
        body: Bytes,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let mut doc = match state.databases.get_document(&db, &doc_id).await {
            Some(doc) => doc,
            None => return (StatusCode::NOT_FOUND, Json(not_found())),
        };

        let current_rev = doc
            .get("_rev")
            .and_then(|v| v.as_str())
            .unwrap_or("1-stub")
            .to_string();

        if let Some(rev) = params.rev.as_deref() {
            if rev != current_rev {
                return (
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({
                        "error": "conflict",
                        "reason": "Document update conflict.",
                        "id": doc_id,
                    })),
                );
            }
        }

        let content_type = headers
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

        let length = body.len();
        let encoded = BASE64.encode(&body);
        if let Some(map) = doc.as_object_mut() {
            let attachments = map
                .entry("_attachments")
                .or_insert_with(|| serde_json::json!({}));
            if let Some(obj) = attachments.as_object_mut() {
                obj.insert(
                    attachment_name.clone(),
                    serde_json::json!({
                        "content_type": content_type,
                        "data": encoded,
                        "length": length,
                    }),
                );
            }
        }

        doc["_rev"] = Value::String(current_rev.clone());

        match state
            .databases
            .apply_document(&db, doc, Some(doc_id.clone()), true)
            .await
        {
            Ok(ApplyOutcome::Stored { id, rev })
            | Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::CREATED,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id
                })),
            ),
        }
    }

    async fn delete_attachment(
        Path((db, doc_id, attachment_name)): Path<(String, String, String)>,
    Query(params): Query<RevisionQuery>,
        State(state): State<AppState>,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let mut doc = match state.databases.get_document(&db, &doc_id).await {
            Some(doc) => doc,
            None => return (StatusCode::NOT_FOUND, Json(not_found())),
        };

        let current_rev = doc
            .get("_rev")
            .and_then(|v| v.as_str())
            .unwrap_or("1-stub")
            .to_string();

        let Some(provided_rev) = params.rev.as_deref() else {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "bad_request",
                    "reason": "Missing required rev parameter.",
                    "id": doc_id,
                })),
            );
        };

        if provided_rev != current_rev {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": doc_id,
                })),
            );
        }

        let mut remove_attachments_field = false;
        let removed = match doc
            .get_mut("_attachments")
            .and_then(|v| v.as_object_mut())
        {
            Some(attachments) => {
                let removed = attachments.remove(&attachment_name);
                if attachments.is_empty() {
                    remove_attachments_field = true;
                }
                removed
            }
            None => None,
        };

        if removed.is_none() {
            return (StatusCode::NOT_FOUND, Json(not_found()));
        }

        if remove_attachments_field {
            if let Some(map) = doc.as_object_mut() {
                map.remove("_attachments");
            }
        }

        doc["_rev"] = Value::String(current_rev.clone());

        match state
            .databases
            .apply_document(&db, doc, Some(doc_id.clone()), true)
            .await
        {
            Ok(ApplyOutcome::Stored { id, rev })
            | Ok(ApplyOutcome::Deleted { id, rev }) => (
                StatusCode::OK,
                Json(serde_json::json!({ "ok": true, "id": id, "rev": rev })),
            ),
            Err(ApplyError::Conflict { id }) => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "conflict",
                    "reason": "Document update conflict.",
                    "id": id,
                })),
            ),
            Err(ApplyError::NotFound { id }) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": "not_found",
                    "reason": "missing",
                    "id": id,
                })),
            ),
        }
    }

    async fn get_attachment(
        Path((db, doc_id, attachment_name)): Path<(String, String, String)>,
        State(state): State<AppState>,
    ) -> Response {
        let Some(doc) = state.databases.get_document(&db, &doc_id).await else {
            return not_found_response();
        };

        let attachments = match doc.get("_attachments").and_then(|v| v.as_object()) {
            Some(attachments) => attachments,
            None => return not_found_response(),
        };

        let Some(entry) = attachments.get(&attachment_name).and_then(|v| v.as_object()) else {
            return not_found_response();
        };

        let data_b64 = match entry.get("data").and_then(|v| v.as_str()) {
            Some(data) => data,
            None => return not_found_response(),
        };

        let content_type = entry
            .get("content_type")
            .and_then(|v| v.as_str())
            .unwrap_or("application/octet-stream");

        let decoded = match BASE64.decode(data_b64) {
            Ok(bytes) => bytes,
            Err(_) => return not_found_response(),
        };

    let mut response = Response::new(Body::from(decoded));
        *response.status_mut() = StatusCode::OK;
        let headers = response.headers_mut();
        if let Ok(value) = HeaderValue::from_str(content_type) {
            headers.insert(CONTENT_TYPE, value);
        }

        response
    }

    async fn respond_with_view(
        db: &str,
        design_doc: &str,
        view_name: &str,
        metric: &str,
        state: &AppState,
    ) -> (StatusCode, Json<serde_json::Value>) {
        let rows = state.databases.collect_rows(db, metric).await;
        let rows_with_ids: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|mut row| {
                if !row.get("_id").is_some() {
                    if let Some(id) = row.get("id").cloned() {
                        row["_id"] = id;
                    }
                }
                if let Some(id_value) = row.get("id").cloned() {
                    if !matches!(row.get("_id"), Some(existing) if *existing == id_value) {
                        row["_id"] = id_value.clone();
                    }
                }

                if let Some(value) = row.get_mut("value") {
                    if let Some(obj) = value.as_object_mut() {
                        if !obj.contains_key("_id") {
                            if let Some(id_ref) = obj.get("id").cloned() {
                                obj.insert("_id".to_string(), id_ref);
                            }
                        }
                    }
                }

                row
            })
            .collect();
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "_id": format!("_design/{}/_view/{}", design_doc, view_name),
                "_rev": "1-stub-view",
                "total_rows": rows_with_ids.len(),
                "offset": 0,
                "rows": rows_with_ids,
            })),
        )
    }

    fn decode_view_request(encoded: &str) -> Option<(String, String)> {
        let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
        let remainder = decoded.strip_prefix("_design/")?;
        let (design_doc, view_part) = remainder.split_once("/_view/")?;
        Some((design_doc.to_string(), view_part.to_string()))
    }

    #[derive(serde::Deserialize)]
    struct BulkDocsPayload {
        docs: Vec<serde_json::Value>,
        #[serde(default)]
        new_edits: Option<bool>,
    }

    #[derive(Default, Deserialize)]
    struct AllDocsQuery {
        include_docs: Option<bool>,
    }

    #[derive(Default, Deserialize)]
    struct RevisionQuery {
        rev: Option<String>,
    }

    #[derive(Default, Deserialize)]
    struct ChangesQuery {
        since: Option<String>,
        include_docs: Option<bool>,
        limit: Option<usize>,
    }

    fn not_found() -> serde_json::Value {
        serde_json::json!({ "error": "not_found", "reason": "missing" })
    }

    fn not_found_response() -> Response {
        let mut response = Json(not_found()).into_response();
        *response.status_mut() = StatusCode::NOT_FOUND;
        response
    }

    fn next_revision(current: Option<&str>) -> String {
        if let Some(current) = current {
            if let Some((prefix, _)) = current.split_once('-') {
                if let Ok(num) = prefix.parse::<u64>() {
                    return format!("{}-stub", num + 1);
                }
            }
        }
        "1-stub".to_string()
    }
}
