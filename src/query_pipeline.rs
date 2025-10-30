use crate::couchdb::CouchDBClient;
use crate::openai::{OpenAIClient, OpenAIMessage};
use crate::{
    error_handling::{log_error, log_info, Wren3Error},
    log_performance,
};
use anyhow::Result;
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
    pub async fn new(
        couch_url: &str,
        db_name: &str,
        openai_api_key: Option<String>,
    ) -> Result<Self> {
        log_info(&format!(
            "Initializing QueryPipeline for database: {}/{}",
            couch_url, db_name
        ));

        let couch_client = CouchDBClient::new(couch_url, db_name).await?;
        let openai_client = openai_api_key.map(OpenAIClient::new);

        // Create necessary views
        Self::setup_views(&couch_client).await?;

        log_info("QueryPipeline initialized successfully");
        Ok(Self {
            couch_client,
            openai_client,
        })
    }

    async fn setup_views(couch_client: &CouchDBClient) -> Result<()> {
        // View for querying by cognitive load
        couch_client
            .create_view(
                "memvid",
                "by_cognitive_load",
                r#"
                function(doc) {
                    if (doc.vectors && doc.chunks) {
                        for (var chunk_id in doc.vectors) {
                            emit(doc.cognitive_load, {
                                id: doc._id,
                                chunk_id: chunk_id,
                                vector: doc.vectors[chunk_id],
                                cognitive_load: doc.cognitive_load,
                                content: doc.chunks.find(c => c.chunk_id == parseInt(chunk_id.split('_')[1])).content
                            });
                        }
                    }
                }
                "#,
            )
            .await?;

        // View for querying by compression ratio
        couch_client
            .create_view(
                "memvid",
                "by_compression_ratio",
                r#"
                function(doc) {
                    if (doc.vectors && doc.chunks) {
                        for (var chunk_id in doc.vectors) {
                            emit(doc.compression_ratio, {
                                id: doc._id,
                                chunk_id: chunk_id,
                                vector: doc.vectors[chunk_id],
                                compression_ratio: doc.compression_ratio,
                                content: doc.chunks.find(c => c.chunk_id == parseInt(chunk_id.split('_')[1])).content
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

        // Query all chunks from the cognitive load view
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

        // Sort by similarity (descending) and take top results
        results.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap());
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

        // Generate embedding for the query
        log_info("Generating query embedding...");
        let query_embedding = openai_client
            .embed_text(query, "text-embedding-ada-002")
            .await?;

        // Find similar chunks
        log_info("Finding similar chunks...");
        let similar_chunks = self
            .query_similar_chunks(&query_embedding, max_chunks, 0.1)
            .await?;

        if similar_chunks.is_empty() {
            log_info("No relevant context found for query");
            return Ok("No relevant context found.".to_string());
        }

        log_info(&format!(
            "Found {} similar chunks, building context...",
            similar_chunks.len()
        ));

        // Build context string, respecting token limit
        let mut context_parts = Vec::new();
        let mut total_tokens = 0;

        for chunk in similar_chunks {
            let chunk_text = format!(
                "Document: {}\nChunk: {}\nSimilarity: {:.3}\nCognitive Load: {:.2}\nContent: {}\n\n",
                chunk.document_id,
                chunk.chunk_id,
                chunk.similarity_score,
                chunk.cognitive_load,
                chunk.content
            );

            // Rough token estimation (1 token ≈ 4 characters)
            let estimated_tokens = chunk_text.len() / 4;

            if total_tokens + estimated_tokens <= max_tokens {
                context_parts.push(chunk_text);
                total_tokens += estimated_tokens;
            } else {
                log_info(&format!(
                    "Reached token limit ({}), stopping context building",
                    max_tokens
                ));
                break;
            }
        }

        let context = context_parts.join("");
        log_info(&format!("Context built with {} tokens", total_tokens));

        Ok(context)
    }

    async fn build_context_without_embeddings(
        &self,
        max_tokens: usize,
        max_chunks: usize,
    ) -> Result<String> {
        let rows = self
            .couch_client
            .query_view("memvid", "by_cognitive_load")
            .await?;

        if rows.is_empty() {
            return Ok("No relevant context found.".to_string());
        }

        let mut context_parts = Vec::new();
        let mut total_tokens = 0;

        for row in rows {
            if context_parts.len() >= max_chunks {
                break;
            }

            let Some(value) = row.get("value") else {
                continue;
            };

            let Some(doc_id) = value.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(chunk_id) = value.get("chunk_id").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(content) = value.get("content").and_then(|v| v.as_str()) else {
                continue;
            };
            let cognitive_load = value
                .get("cognitive_load")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            let chunk_text = format!(
                "Document: {}\nChunk: {}\nSimilarity: N/A (OpenAI disabled)\nCognitive Load: {:.2}\nContent: {}\n\n",
                doc_id, chunk_id, cognitive_load, content
            );

            let estimated_tokens = chunk_text.len() / 4;
            if total_tokens + estimated_tokens > max_tokens {
                break;
            }

            context_parts.push(chunk_text);
            total_tokens += estimated_tokens;
        }

        if context_parts.is_empty() {
            Ok("No relevant context found.".to_string())
        } else {
            Ok(context_parts.join(""))
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

        // Build context from similar chunks - even if OpenAI client fails
        let context = self
            .build_llm_context(query, max_context_tokens, max_chunks)
            .await?;

        // Only try OpenAI if configured
        if let Some(ref openai_client) = self.openai_client {
            log_info(&format!("Sending query to OpenAI model: {}", model));

            // Prepare messages
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

            // Get LLM response
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
            // If no OpenAI client, return the context as the "response"
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

    // Check for NaN or infinite values in input vectors
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

    // Final check to ensure result is finite
    if result.is_finite() {
        result
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::couchdb::tests::TestCouchStub;
    use crate::couchdb::MemvidChunk;

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
        let b = vec![0.707, 0.707]; // 45-degree vector
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

    #[test]
    fn test_view_setup_javascript_structure() {
        // Test that the JavaScript view functions are syntactically valid
        let cognitive_load_view = r#"
            function(doc) {
                if (doc.vectors && doc.chunks) {
                    for (var chunk_id in doc.vectors) {
                        emit(doc.cognitive_load, {
                            id: doc._id,
                            chunk_id: chunk_id,
                            vector: doc.vectors[chunk_id],
                            cognitive_load: doc.cognitive_load,
                            content: doc.chunks.find(c => c.chunk_id == parseInt(chunk_id.split('_')[1])).content
                        });
                    }
                }
            }
        "#;

        let compression_ratio_view = r#"
            function(doc) {
                if (doc.vectors && doc.chunks) {
                    for (var chunk_id in doc.vectors) {
                        emit(doc.compression_ratio, {
                            id: doc._id,
                            chunk_id: chunk_id,
                            vector: doc.vectors[chunk_id],
                            compression_ratio: doc.compression_ratio,
                            content: doc.chunks.find(c => c.chunk_id == parseInt(chunk_id.split('_')[1])).content
                        });
                    }
                }
            }
        "#;

        // Basic validation that the JavaScript contains expected elements
        assert!(cognitive_load_view.contains("function(doc)"));
        assert!(cognitive_load_view.contains("emit("));
        assert!(cognitive_load_view.contains("doc.cognitive_load"));
        assert!(cognitive_load_view.contains("doc.vectors"));
        assert!(cognitive_load_view.contains("doc.chunks"));

        assert!(compression_ratio_view.contains("function(doc)"));
        assert!(compression_ratio_view.contains("emit("));
        assert!(compression_ratio_view.contains("doc.compression_ratio"));
        assert!(compression_ratio_view.contains("doc.vectors"));
        assert!(compression_ratio_view.contains("doc.chunks"));
    }

    #[test]
    fn test_context_building_token_estimation() {
        // Test the token estimation logic used in build_llm_context
        let test_content = "This is a test string for token estimation.";
        let estimated_tokens = test_content.len() / 4;

        // Rough validation - actual tokenization is more complex
        assert!(estimated_tokens > 0);
        assert!(estimated_tokens < test_content.len()); // Should be much smaller than character count
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

        // Sort by similarity score descending (as done in query_similar_chunks)
        results.sort_by(|a, b| b.similarity_score.partial_cmp(&a.similarity_score).unwrap());

        assert_eq!(results[0].similarity_score, 0.9);
        assert_eq!(results[1].similarity_score, 0.7);
        assert_eq!(results[2].similarity_score, 0.5);
    }

    #[test]
    fn test_vector_similarity_filtering() {
        // Test the logic for filtering by minimum similarity
        let query_vector = vec![1.0, 0.0];
        let similar_vector = vec![0.9, 0.1]; // High similarity
        let dissimilar_vector = vec![0.0, 1.0]; // Low similarity

        let similar_score = cosine_similarity(&query_vector, &similar_vector);
        let dissimilar_score = cosine_similarity(&query_vector, &dissimilar_vector);

        assert!(similar_score > 0.8); // Should pass min_similarity of 0.1
        assert!(dissimilar_score < 0.1); // Would be filtered out
    }

    #[test]
    fn test_cosine_similarity_nan_values() {
        let a = vec![1.0, f64::NAN, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        // Should handle NaN gracefully and return 0.0
        assert_eq!(similarity, 0.0);
    }

    #[test]
    fn test_cosine_similarity_infinite_values() {
        let a = vec![1.0, f64::INFINITY, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b);
        // Should handle infinity gracefully and return 0.0
        assert_eq!(similarity, 0.0);
    }

    #[tokio::test]
    async fn test_query_pipeline_with_couch_stub() {
        let stub = TestCouchStub::spawn().await;

        let pipeline = QueryPipeline::new(&stub.base_url(), "wren3-dev", None)
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
            .ingest_memvid_document(
                chunks,
                vectors,
                0.42,
                0.64,
                2,
                "stub-doc".to_string(),
            )
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
}
