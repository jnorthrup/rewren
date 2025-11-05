use crate::config::DatabaseConfig;
use crate::couchdb::{CouchDBClient, CouchDbConfig};
use crate::openai::{OpenAIClient, OpenAIMessage};
use crate::{
    error_handling::{log_error, log_info, Wren3Error},
    log_performance,
};
use anyhow::Result;
use serde_json::json;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct QueryResult {
    pub document_id: String,
    pub chunk_id: String,
    pub content: String,
    pub similarity_score: f64,
    pub cognitive_load: f64,
    #[allow(dead_code)]
    pub vector: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct QueryPipeline {
    pub couch_client: CouchDBClient,
    openai_client: Option<OpenAIClient>,
}

impl QueryPipeline {
    pub async fn new(database: &DatabaseConfig, openai_api_key: Option<String>) -> Result<Self> {
        log_info(&format!(
            "Initializing QueryPipeline for database: {}/{}",
            database.url, database.name
        ));

        let couch_client = match (&database.username, &database.password) {
            (Some(username), Some(password)) => {
                let couch_config = CouchDbConfig::new(&database.url, &database.name)
                    .with_credentials(username.clone(), password.clone());
                CouchDBClient::from_config(couch_config).await?
            }
            _ => CouchDBClient::new(&database.url, &database.name).await?,
        };
        let openai_client = openai_api_key.map(OpenAIClient::new);

        Self::setup_views(&couch_client).await?;

        let cfg = couch_client.config();
        log_info(&format!(
            "Connected to CouchDB at {} using database {}",
            cfg.url, cfg.database
        ));

        log_info("QueryPipeline initialized successfully");
        Ok(Self {
            couch_client,
            openai_client,
        })
    }

    async fn setup_views(couch_client: &CouchDBClient) -> Result<()> {
        couch_client
            .create_view(
                "memvid",
                "by_cognitive_load",
                r#"
                function(doc) {
                    if (doc.vectors && doc.chunks) {
                        for (var chunk_id in doc.vectors) {
                            var chunkContent = "";
                            if (Array.isArray(doc.chunks)) {
                                for (var i = 0; i < doc.chunks.length; i++) {
                                    var chunk = doc.chunks[i];
                                    if (chunk && chunk.id === chunk_id) {
                                        chunkContent = chunk.content || "";
                                        break;
                                    }
                                }
                            }
                            emit(doc.cognitive_load, {
                                id: doc._id,
                                chunk_id: chunk_id,
                                vector: doc.vectors[chunk_id],
                                cognitive_load: doc.cognitive_load,
                                content: chunkContent
                            });
                        }
                    }
                }
                "#,
            )
            .await?;

        couch_client
            .create_view(
                "memvid",
                "by_compression_ratio",
                r#"
                function(doc) {
                    if (doc.vectors && doc.chunks) {
                        for (var chunk_id in doc.vectors) {
                            var chunkContent = "";
                            if (Array.isArray(doc.chunks)) {
                                for (var i = 0; i < doc.chunks.length; i++) {
                                    var chunk = doc.chunks[i];
                                    if (chunk && chunk.id === chunk_id) {
                                        chunkContent = chunk.content || "";
                                        break;
                                    }
                                }
                            }
                            emit(doc.compression_ratio, {
                                id: doc._id,
                                chunk_id: chunk_id,
                                vector: doc.vectors[chunk_id],
                                compression_ratio: doc.compression_ratio,
                                content: chunkContent
                            });
                        }
                    }
                }
                "#,
            )
            .await?;

        Ok(())
    }

    pub async fn query_similar_chunks(
        &self,
        query_vector: &[f64],
        limit: usize,
        min_similarity: f64,
    ) -> Result<Vec<QueryResult>> {
        log_info(&format!(
            "Querying for similar chunks with vector length: {}, limit: {}, min_similarity: {}",
            query_vector.len(),
            limit,
            min_similarity
        ));

        let start_time = Instant::now();

        let rows = self
            .couch_client
            .query_view("memvid", "by_cognitive_load")
            .await?;

        let mut results = Vec::new();

        for row in rows {
            if let Some(value) = row.get("value") {
                if let (
                    Some(id),
                    Some(chunk_id),
                    Some(vector),
                    Some(content),
                    Some(cognitive_load),
                ) = (
                    value.get("id").and_then(|v| v.as_str()),
                    value.get("chunk_id").and_then(|v| v.as_str()),
                    value.get("vector").and_then(|v| v.as_array()),
                    value.get("content").and_then(|v| v.as_str()),
                    value.get("cognitive_load").and_then(|v| v.as_f64()),
                ) {
                    let chunk_vector: Vec<f64> = vector.iter().filter_map(|v| v.as_f64()).collect();

                    if chunk_vector.len() == query_vector.len() {
                        let similarity = cosine_similarity(query_vector, &chunk_vector);

                        if similarity >= min_similarity {
                            results.push(QueryResult {
                                document_id: id.to_string(),
                                chunk_id: chunk_id.to_string(),
                                content: content.to_string(),
                                similarity_score: similarity,
                                cognitive_load,
                                vector: chunk_vector,
                            });
                        }
                    }
                }
            }
        }

        results.sort_by(|a, b| {
            b.similarity_score
                .partial_cmp(&a.similarity_score)
                .unwrap_or(Ordering::Equal)
        });
        results.truncate(limit);

        let elapsed = start_time.elapsed();
        log_performance!("query_similar_chunks", {
            log_info(&format!(
                "Found {} similar chunks in {:.2?}ms",
                results.len(),
                elapsed.as_millis()
            ));
        });

        Ok(results)
    }

    pub async fn build_llm_context(
        &self,
        query: &str,
        max_tokens: usize,
        max_chunks: usize,
    ) -> Result<String> {
        log_info(&format!(
            "Building LLM context for query: '{}...' ({} chars)",
            &query.chars().take(50).collect::<String>(),
            query.len()
        ));

        if self.openai_client.is_none() {
            log_info("OpenAI client not configured, using fallback context builder");
            return self
                .build_context_without_embeddings(max_tokens, max_chunks)
                .await;
        }

        let openai_client = self.openai_client.as_ref().unwrap();

        // Quick pre-check: if no single stored chunk could possibly fit the
        // provided `max_tokens` budget (approx by char/4), skip generating an
        // embedding and avoid calling the OpenAI API.
        let rows = self.couch_client.query_view("memvid", "by_cognitive_load").await?;
        let mut any_fittable = false;
        for row in &rows {
            if let Some(value) = row.get("value") {
                if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
                    let chunk_text = format!(
                        "Document: {}\nChunk: {}\nSimilarity: N/A (pre-check)\nCognitive Load: {:.2}\nContent: {}\n\n",
                        value.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        value.get("chunk_id").and_then(|v| v.as_str()).unwrap_or(""),
                        value.get("cognitive_load").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        content
                    );

                    let estimated_tokens = chunk_text.len() / 4;
                    if estimated_tokens <= max_tokens {
                        any_fittable = true;
                        break;
                    }
                }
            }
        }

        if !any_fittable {
            log_info("No stored chunks can fit the token budget; skipping embedding/API call");
            return Ok("No relevant context found for the query.".to_string());
        }

        log_info("Generating query embedding...");
        let query_embedding: Vec<f64> = openai_client
            .embed_text(query, "text-embedding-ada-002")
            .await?;

        log_info("Finding similar chunks...");
        let similar_chunks = self
            .query_similar_chunks(&query_embedding, max_chunks, 0.1)
            .await?;

        if similar_chunks.is_empty() {
            log_info("No relevant context found for query");
            return Ok("No relevant context found.".to_string());
        }

        // Use shared assembly logic so both embedding-powered and fallback
        // context builders behave the same when encountering oversized chunks.
        let context = QueryPipeline::assemble_context_from_query_results(
            similar_chunks,
            max_tokens,
            max_chunks,
        );

        log_info(&format!("Context built (approx {} chars)", context.len()));

        Ok(context)
    }

    // Assemble context text from a list of QueryResult entries.
    // Behavior:
    // - Respect `max_chunks` (number of chunks included)
    // - Respect `max_tokens` (approx via char/4 heuristic)
    // - Skip individual chunks that would not fit (don't abort the loop)
    fn assemble_context_from_query_results(
        similar_chunks: Vec<QueryResult>,
        max_tokens: usize,
        max_chunks: usize,
    ) -> String {
        let mut context_parts = Vec::new();
        let mut total_tokens = 0;

        for chunk in similar_chunks {
            if context_parts.len() >= max_chunks {
                break;
            }

            let chunk_text = format!(
                "Document: {}\nChunk: {}\nSimilarity: {:.3}\nCognitive Load: {:.2}\nContent: {}\n\n",
                chunk.document_id, chunk.chunk_id, chunk.similarity_score, chunk.cognitive_load, chunk.content
            );

            let estimated_tokens = chunk_text.len() / 4;
            if total_tokens + estimated_tokens > max_tokens {
                // Skip this oversized chunk and continue to the next one.
                continue;
            }

            context_parts.push(chunk_text);
            total_tokens += estimated_tokens;
        }

        context_parts.join("")
    }

    async fn build_context_without_embeddings(
        &self,
        max_tokens: usize,
        max_chunks: usize,
    ) -> Result<String> {
        let mut rows = self
            .couch_client
            .query_view("memvid", "by_cognitive_load")
            .await?;

        if rows.is_empty() {
            return Ok("No relevant context found.".to_string());
        }

        rows.sort_by(|a, b| {
            let a_load = a
                .get("value")
                .and_then(|value| value.get("cognitive_load"))
                .and_then(|v| v.as_f64())
                .unwrap_or(f64::NEG_INFINITY);
            let b_load = b
                .get("value")
                .and_then(|value| value.get("cognitive_load"))
                .and_then(|v| v.as_f64())
                .unwrap_or(f64::NEG_INFINITY);

            b_load
                .partial_cmp(&a_load)
                .unwrap_or(Ordering::Equal)
        });

        // Convert rows into QueryResult list and reuse the shared assembler so
        // fallback and embedding-powered paths behave consistently.
        let mut query_results: Vec<QueryResult> = Vec::new();

        for row in rows {
            let Some(value) = row.get("value") else { continue; };

            let Some(doc_id) = value.get("id").and_then(|v| v.as_str()) else { continue; };
            let Some(chunk_id) = value.get("chunk_id").and_then(|v| v.as_str()) else { continue; };
            let Some(content) = value.get("content").and_then(|v| v.as_str()) else { continue; };
            let cognitive_load = value
                .get("cognitive_load")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            query_results.push(QueryResult {
                document_id: doc_id.to_string(),
                chunk_id: chunk_id.to_string(),
                content: content.to_string(),
                similarity_score: 0.0, // N/A for fallback
                cognitive_load,
                vector: Vec::new(),
            });
        }

        let context = QueryPipeline::assemble_context_from_query_results(
            query_results,
            max_tokens,
            max_chunks,
        );

        if context.is_empty() {
            Ok("No relevant context found.".to_string())
        } else {
            Ok(context)
        }
    }

    pub async fn query_with_llm(
        &self,
        query: &str,
        system_prompt: Option<&str>,
        model: &str,
        max_context_tokens: usize,
        max_chunks: usize,
    ) -> Result<String> {
        log_info(&format!(
            "Processing query with LLM: '{}...' ({} chars)",
            &query.chars().take(50).collect::<String>(),
            query.len()
        ));

        let context = self
            .build_llm_context(query, max_context_tokens, max_chunks)
            .await?;

        // If context is empty (no chunks fit or no relevant context), avoid
        // calling the external LLM and return a clear message.
        if context.trim().is_empty() || context == "No relevant context found." || context == "No relevant context found for the query." {
            log_info("No relevant context available; skipping OpenAI call");
            return Ok("No relevant context found for the query.".to_string());
        }

        if let Some(ref openai_client) = self.openai_client {
            log_info(&format!("Sending query to OpenAI model: {}", model));

            let mut messages = Vec::new();

            if let Some(system) = system_prompt {
                messages.push(OpenAIMessage {
                    role: "system".to_string(),
                    content: system.to_string(),
                });
            }

            messages.push(OpenAIMessage {
                role: "user".to_string(),
                content: format!("Context:\n{}\n\nQuery: {}", context, query),
            });

            let response = openai_client
                .chat_completion_simple(model, messages, Some(1000), Some(0.7))
                .await;

            match &response {
                Ok(_) => log_info("Successfully received response from OpenAI"),
                Err(e) => log_error("query_with_llm", &Wren3Error::OpenAI(e.to_string())),
            }

            response
        } else {
            log_info("No OpenAI client configured, returning context as response");
            if context.is_empty() {
                Ok("No relevant context found for the query.".to_string())
            } else {
                Ok(context)
            }
        }
    }
}

fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() {
        return 0.0;
    }

    for &val in a.iter().chain(b.iter()) {
        if !val.is_finite() {
            return 0.0;
        }
    }

    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..a.len() {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    let result = dot_product / (norm_a.sqrt() * norm_b.sqrt());

    if result.is_finite() {
        result
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::couchdb::{CouchDBClient, MemvidChunk};
    use crate::couchdb_stub::TestCouchStub;
    use reqwest::Client as HttpClient;

    #[test]
    fn test_cosine_similarity_identical_vectors() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal_vectors() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite_vectors() {
        let a = vec![1.0, 2.0];
        let b = vec![-1.0, -2.0];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_different_lengths() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0];
        let similarity = cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }

    #[test]
    fn test_cosine_similarity_zero_vector() {
        let a = vec![0.0, 0.0, 0.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }

    #[test]
    fn test_cosine_similarity_partial_overlap() {
        let a = vec![1.0, 0.0];
        let b = vec![0.707, 0.707];
        let similarity = cosine_similarity(&a, &b);
        assert!((similarity - 0.707).abs() < 1e-3);
    }

    #[test]
    fn test_query_result_creation() {
        let result = QueryResult {
            document_id: "doc1".to_string(),
            chunk_id: "chunk_0".to_string(),
            content: "Test content".to_string(),
            similarity_score: 0.85,
            cognitive_load: 0.73,
            vector: vec![0.1, 0.2, 0.3],
        };

        assert_eq!(result.document_id, "doc1");
        assert_eq!(result.chunk_id, "chunk_0");
        assert_eq!(result.content, "Test content");
        assert!((result.similarity_score - 0.85).abs() < 1e-6);
        assert!((result.cognitive_load - 0.73).abs() < 1e-6);
        assert_eq!(result.vector, vec![0.1, 0.2, 0.3]);
    }

    #[tokio::test]
    async fn test_view_setup_javascript_structure() {
        let stub = TestCouchStub::spawn().await;

        let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
            .await
            .expect("failed to create couch client");

        QueryPipeline::setup_views(&client)
            .await
            .expect("failed to install design documents");

        let http = HttpClient::new();
        let design_doc_url = format!("{}/wren3-dev/_design/memvid", stub.base_url());
        let design_doc: serde_json::Value = http
            .get(&design_doc_url)
            .send()
            .await
            .expect("design doc fetch failed")
            .json()
            .await
            .expect("design doc parse failed");

        let cognitive_map = design_doc["views"]["by_cognitive_load"]["map"]
            .as_str()
            .expect("missing cognitive load map function");
        assert!(cognitive_map.contains("function(doc)"));
        assert!(cognitive_map.contains("emit("));
        assert!(cognitive_map.contains("doc.cognitive_load"));
        assert!(cognitive_map.contains("doc.vectors"));
        assert!(cognitive_map.contains("chunkContent"));

        let compression_map = design_doc["views"]["by_compression_ratio"]["map"]
            .as_str()
            .expect("missing compression ratio map function");
        assert!(compression_map.contains("function(doc)"));
        assert!(compression_map.contains("emit("));
        assert!(compression_map.contains("doc.compression_ratio"));
        assert!(compression_map.contains("doc.vectors"));
        assert!(compression_map.contains("chunkContent"));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_view_map_uses_chunk_id_field() {
        let stub = TestCouchStub::spawn().await;

        let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
            .await
            .expect("failed to create couch client");

        QueryPipeline::setup_views(&client)
            .await
            .expect("failed to install design documents");

        let http = HttpClient::new();
        let design_doc_url = format!("{}/wren3-dev/_design/memvid", stub.base_url());
        let design_doc: serde_json::Value = http
            .get(&design_doc_url)
            .send()
            .await
            .expect("design doc fetch failed")
            .json()
            .await
            .expect("design doc parse failed");

        let cognitive_map = design_doc["views"]["by_cognitive_load"]["map"]
            .as_str()
            .expect("missing cognitive load map function");
        assert!(cognitive_map.contains("chunk && chunk.id === chunk_id"));
        assert!(!cognitive_map.contains("c.chunk_id"));

        let compression_map = design_doc["views"]["by_compression_ratio"]["map"]
            .as_str()
            .expect("missing compression ratio map function");
        assert!(compression_map.contains("chunk && chunk.id === chunk_id"));
        assert!(!compression_map.contains("c.chunk_id"));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_view_map_avoids_es6_array_find() {
        let stub = TestCouchStub::spawn().await;

        let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
            .await
            .expect("failed to create couch client");

        QueryPipeline::setup_views(&client)
            .await
            .expect("failed to install design documents");

        let http = HttpClient::new();
        let design_doc_url = format!("{}/wren3-dev/_design/memvid", stub.base_url());
        let design_doc: serde_json::Value = http
            .get(&design_doc_url)
            .send()
            .await
            .expect("design doc fetch failed")
            .json()
            .await
            .expect("design doc parse failed");

        let cognitive_map = design_doc["views"]["by_cognitive_load"]["map"]
            .as_str()
            .expect("missing cognitive load map function");
        assert!(!cognitive_map.contains(".find("));

        let compression_map = design_doc["views"]["by_compression_ratio"]["map"]
            .as_str()
            .expect("missing compression ratio map function");
        assert!(!compression_map.contains(".find("));

        stub.shutdown().await;
    }

    #[test]
    fn test_context_building_token_estimation() {
        let test_content = "This is a test string for token estimation.";
        let estimated_tokens = test_content.len() / 4;

        assert!(estimated_tokens > 0);
        assert!(estimated_tokens < test_content.len());
    }

    #[test]
    fn test_context_formatting() {
        let chunk = QueryResult {
            document_id: "doc123".to_string(),
            chunk_id: "chunk_0".to_string(),
            content: "Sample content".to_string(),
            similarity_score: 0.85,
            cognitive_load: 0.73,
            vector: vec![0.1, 0.2, 0.3],
        };

        let formatted = format!(
            "Document: {}\nChunk: {}\nSimilarity: {:.3}\nCognitive Load: {:.2}\nContent: {}\n\n",
            chunk.document_id,
            chunk.chunk_id,
            chunk.similarity_score,
            chunk.cognitive_load,
            chunk.content
        );

        assert!(formatted.contains("Document: doc123"));
        assert!(formatted.contains("Chunk: chunk_0"));
        assert!(formatted.contains("Similarity: 0.850"));
        assert!(formatted.contains("Cognitive Load: 0.73"));
        assert!(formatted.contains("Content: Sample content"));
    }

    #[test]
    fn test_similarity_score_sorting_logic() {
        let mut results = vec![
            QueryResult {
                document_id: "doc1".to_string(),
                chunk_id: "chunk_0".to_string(),
                content: "Content 1".to_string(),
                similarity_score: 0.5,
                cognitive_load: 0.7,
                vector: vec![0.1, 0.2],
            },
            QueryResult {
                document_id: "doc2".to_string(),
                chunk_id: "chunk_0".to_string(),
                content: "Content 2".to_string(),
                similarity_score: 0.9,
                cognitive_load: 0.6,
                vector: vec![0.3, 0.4],
            },
            QueryResult {
                document_id: "doc3".to_string(),
                chunk_id: "chunk_0".to_string(),
                content: "Content 3".to_string(),
                similarity_score: 0.7,
                cognitive_load: 0.8,
                vector: vec![0.5, 0.6],
            },
        ];

        results.sort_by(|a, b| {
            b.similarity_score
                .partial_cmp(&a.similarity_score)
                .unwrap_or(Ordering::Equal)
        });

        assert_eq!(results[0].similarity_score, 0.9);
        assert_eq!(results[1].similarity_score, 0.7);
        assert_eq!(results[2].similarity_score, 0.5);
    }

    #[test]
    fn test_vector_similarity_filtering() {
        let query_vector = vec![1.0, 0.0];
        let similar_vector = vec![0.9, 0.1];
        let dissimilar_vector = vec![0.0, 1.0];

        let similar_score = cosine_similarity(&query_vector, &similar_vector);
        let dissimilar_score = cosine_similarity(&query_vector, &dissimilar_vector);

        assert!(similar_score > 0.8);
        assert!(dissimilar_score < 0.1);
    }

    #[test]
    fn test_cosine_similarity_nan_values() {
        let a = vec![1.0, f64::NAN, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }

    #[test]
    fn test_cosine_similarity_infinite_values() {
        let a = vec![1.0, f64::INFINITY, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }

    #[tokio::test]
    async fn test_query_pipeline_with_couch_stub() {
        let stub = TestCouchStub::spawn().await;

        let db_config = DatabaseConfig {
            url: stub.base_url(),
            name: "wren3-dev".to_string(),
            username: None,
            password: None,
        };

        let pipeline = QueryPipeline::new(&db_config, None)
            .await
            .expect("QueryPipeline initialization failed");

        let chunks = vec![MemvidChunk {
            id: "chunk_0".to_string(),
            content: "stubbed payload".to_string(),
            start_offset: 0,
            end_offset: 14,
        }];

        let mut vectors = std::collections::HashMap::new();
        let chunk_vector = vec![0.3, 0.6, 0.9];
        vectors.insert("chunk_0".to_string(), chunk_vector.clone());

        let doc_id = pipeline
            .couch_client
            .ingest_memvid_document(chunks, vectors, 0.42, 0.64, 2, "stub-doc".to_string())
            .await
            .expect("document ingest failed");

        let results = pipeline
            .query_similar_chunks(&chunk_vector, 3, 0.1)
            .await
            .expect("chunk query failed");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_id, doc_id);
        assert_eq!(results[0].chunk_id, "chunk_0");
        assert!((results[0].similarity_score - 1.0).abs() < 1e-6);

        let llm_output = pipeline
            .query_with_llm("tell me about stub", None, "unused", 256, 4)
            .await
            .expect("LLM fallback should succeed");
        assert!(llm_output.contains("stubbed payload"));

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_query_with_llm_skips_openai_when_no_context() {
        let stub = TestCouchStub::spawn().await;

        let db_config = DatabaseConfig {
            url: stub.base_url(),
            name: "wren3-dev".to_string(),
            username: None,
            password: None,
        };

        // Provide a dummy API key to create an OpenAI client; the test
        // asserts we do NOT attempt to call it when there's no context.
        let pipeline = QueryPipeline::new(&db_config, Some("dummy-key".to_string()))
            .await
            .expect("QueryPipeline initialization failed");

        // Ingest one oversized chunk so it won't fit the token budget.
        let oversized_content = "X".repeat(2000);
        let chunks = vec![MemvidChunk {
            id: "chunk_big".to_string(),
            content: oversized_content,
            start_offset: 0,
            end_offset: 2000,
        }];
        let mut vectors = HashMap::new();
        vectors.insert("chunk_big".to_string(), vec![1.0, 0.0, 0.0]);

        pipeline
            .couch_client
            .ingest_memvid_document(chunks, vectors, 0.9, 0.5, 1, "hash-big".to_string())
            .await
            .expect("document ingest failed");

        let response = pipeline
            .query_with_llm("summarize this", None, "unused", 64, 2)
            .await
            .expect("query_with_llm should return gracefully");

        assert_eq!(response, "No relevant context found for the query.");

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_query_similar_chunks_considers_rows_outside_limit_window() {
        let stub = TestCouchStub::spawn().await;

        let db_config = DatabaseConfig {
            url: stub.base_url(),
            name: "wren3-dev".to_string(),
            username: None,
            password: None,
        };

        let pipeline = QueryPipeline::new(&db_config, None)
            .await
            .expect("QueryPipeline initialization failed");

        let make_doc = |chunk_label: &str, vector: Vec<f64>, cognitive_load: f64| {
            let chunks = vec![MemvidChunk {
                id: chunk_label.to_string(),
                content: format!("content-{chunk_label}"),
                start_offset: 0,
                end_offset: 10,
            }];

            let mut vectors = HashMap::new();
            vectors.insert(chunk_label.to_string(), vector);

            async move |
                client: &CouchDBClient,
                taxonomical_depth: i32,
                compression_ratio: f64,
                content_hash: &str,
            | {
                client
                    .ingest_memvid_document(
                        chunks,
                        vectors,
                        cognitive_load,
                        compression_ratio,
                        taxonomical_depth,
                        content_hash.to_string(),
                    )
                    .await
            }
        };

        let doc_low = make_doc("chunk_low", vec![1.0, 0.0, 0.0], 0.10);
        let doc_mid = make_doc("chunk_mid", vec![0.6, 0.8, 0.0], 0.20);
        let doc_best = make_doc("chunk_best", vec![0.5, 0.5, 0.0], 0.90);

        let best_id = doc_best(&pipeline.couch_client, 1, 0.5, "hash-best")
            .await
            .expect("best document ingest failed");
        doc_low(&pipeline.couch_client, 1, 0.5, "hash-low")
            .await
            .expect("low document ingest failed");
        doc_mid(&pipeline.couch_client, 1, 0.5, "hash-mid")
            .await
            .expect("mid document ingest failed");

        let mut limited_params = HashMap::new();
        limited_params.insert("limit", json!(2));
        let limited_rows = pipeline
            .couch_client
            .query_view_with_params("memvid", "by_cognitive_load", limited_params)
            .await
            .expect("limited view query failed");
        assert_eq!(limited_rows.len(), 2);
        let limited_ids: Vec<_> = limited_rows
            .iter()
            .filter_map(|row| {
                row.get("value")
                    .and_then(|value| value.get("id"))
                    .and_then(|id| id.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        assert!(
            !limited_ids.contains(&best_id),
            "raw view with limit should exclude the high cognitive_load row"
        );

        let query_vector = vec![0.5, 0.5, 0.0];
        let results = pipeline
            .query_similar_chunks(&query_vector, 2, 0.0)
            .await
            .expect("similar chunk query failed");

        let ids: Vec<_> = results.iter().map(|r| r.document_id.clone()).collect();
        assert!(
            ids.contains(&best_id),
            "highest similarity document should be returned even when cognitive_load ordering would place it after the limit window"
        );

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_build_context_without_embeddings_prioritizes_high_load() {
        let stub = TestCouchStub::spawn().await;

        let db_config = DatabaseConfig {
            url: stub.base_url(),
            name: "wren3-dev".to_string(),
            username: None,
            password: None,
        };

        let pipeline = QueryPipeline::new(&db_config, None)
            .await
            .expect("QueryPipeline initialization failed");

        let chunks_low = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "content-low".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];
        let mut vectors_low = HashMap::new();
        vectors_low.insert("chunk_low".to_string(), vec![1.0, 0.0, 0.0]);

        pipeline
            .couch_client
            .ingest_memvid_document(chunks_low, vectors_low, 0.10, 0.5, 1, "hash-low".to_string())
            .await
            .expect("low load document ingest failed");

        let chunks_high = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: "content-high".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];
        let mut vectors_high = HashMap::new();
        vectors_high.insert("chunk_high".to_string(), vec![1.0, 0.0, 0.0]);

        pipeline
            .couch_client
            .ingest_memvid_document(chunks_high, vectors_high, 0.90, 0.5, 1, "hash-high".to_string())
            .await
            .expect("high load document ingest failed");

        let context = pipeline
            .build_context_without_embeddings(512, 2)
            .await
            .expect("context build failed");

        let high_index = context
            .find("content-high")
            .expect("expected high load chunk in context");
        let low_index = context
            .find("content-low")
            .expect("expected low load chunk in context");

        assert!(
            high_index < low_index,
            "High cognitive load chunk should appear before lower load chunk in fallback context"
        );

        stub.shutdown().await;
    }

    #[tokio::test]
    async fn test_build_context_without_embeddings_skips_oversized_chunks() {
        let stub = TestCouchStub::spawn().await;

        let db_config = DatabaseConfig {
            url: stub.base_url(),
            name: "wren3-dev".to_string(),
            username: None,
            password: None,
        };

        let pipeline = QueryPipeline::new(&db_config, None)
            .await
            .expect("QueryPipeline initialization failed");

        let oversized_content = "X".repeat(2048);
        let chunks_high = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: oversized_content,
            start_offset: 0,
            end_offset: 2048,
        }];
        let mut vectors_high = HashMap::new();
        vectors_high.insert("chunk_high".to_string(), vec![1.0, 0.0, 0.0]);

        pipeline
            .couch_client
            .ingest_memvid_document(chunks_high, vectors_high, 0.95, 0.5, 1, "hash-high".to_string())
            .await
            .expect("high load document ingest failed");

        let chunks_low = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "content-low".to_string(),
            start_offset: 0,
            end_offset: 11,
        }];
        let mut vectors_low = HashMap::new();
        vectors_low.insert("chunk_low".to_string(), vec![0.9, 0.1, 0.0]);

        pipeline
            .couch_client
            .ingest_memvid_document(chunks_low, vectors_low, 0.25, 0.5, 1, "hash-low".to_string())
            .await
            .expect("low load document ingest failed");

        let context = pipeline
            .build_context_without_embeddings(128, 3)
            .await
            .expect("context build failed");

        assert!(context.contains("content-low"), "Expected fallback context to include smaller chunk when high load chunk exceeds token budget");
        assert!(!context.contains("chunk_high"), "Oversized high load chunk should be skipped when it cannot fit within token budget");

        stub.shutdown().await;
    }

    #[test]
    fn test_assemble_context_skips_oversized_chunks() {
        // Create an oversized QueryResult and a small one. The helper should
        // skip the oversized entry and include the smaller chunk.
        let oversized = QueryResult {
            document_id: "doc_big".to_string(),
            chunk_id: "chunk_big".to_string(),
            content: "X".repeat(2000),
            similarity_score: 0.99,
            cognitive_load: 0.95,
            vector: vec![],
        };

        let small = QueryResult {
            document_id: "doc_small".to_string(),
            chunk_id: "chunk_small".to_string(),
            content: "small-content".to_string(),
            similarity_score: 0.8,
            cognitive_load: 0.2,
            vector: vec![],
        };

        let context = QueryPipeline::assemble_context_from_query_results(vec![oversized, small], 128, 3);

        assert!(context.contains("small-content"), "Expected small chunk to be present");
        assert!(!context.contains("chunk_big"), "Oversized chunk should be skipped");
    }
}
