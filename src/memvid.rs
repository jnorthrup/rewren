use crate::couchdb::MemvidChunk;
use crate::error_handling::{log_info, Result, Wren3Error};
use flate2::write::GzEncoder;
use flate2::Compression;
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write;
use std::time::Instant;
use ffmpeg_next as ffmpeg;

pub type MemvidProcessingOutput = (Vec<MemvidChunk>, HashMap<String, Vec<f64>>);

#[derive(Debug, Clone)]
pub struct MemvidCompressionResult {
    pub original_size: usize,
    pub compressed_size: usize,
    pub compression_ratio: f64,
    pub cognitive_load_score: f64,
    pub dimensional_vector: Vec<f64>,
    pub memvid_chunks: Vec<HashMap<String, serde_json::Value>>,
    pub taxonomical_depth: i32,
    pub content_hash: String,
    pub processing_time: f64,
    pub quality_metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone)]
pub struct MemvidEntropicBridge {
    // No need for Python, all native
}

impl MemvidEntropicBridge {
    pub fn new() -> Result<Self> {
        log_info("Initializing native Rust Memvid Bridge with FFmpeg support");
        // Initialize FFmpeg
        ffmpeg::init().map_err(|e| Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("FFmpeg init failed: {}", e))))?;
        Ok(Self {})
    }

    pub fn process_document(&self, text: &str) -> Result<MemvidProcessingOutput> {
        log_info(&format!(
            "Processing document text of {} characters",
            text.len()
        ));

        let start_time = Instant::now();

        // Calculate cognitive load
        let cognitive_load = self.calculate_cognitive_load(text);

        // Compress content
        let (_compressed_data, compression_ratio) = self.compress_content(text)?;

        // Create chunks
        let chunks_data = self.create_memvid_chunks(text);

        // Extract vectors
        let vectors = self.extract_vectors(text);

        // Analyze taxonomical depth
        let _taxonomical_depth = self.analyze_taxonomical_depth(text);

        // Content hash
        let _content_hash = self.calculate_content_hash(text);

        // Quality metrics
        let mut quality_metrics = HashMap::new();
        quality_metrics.insert("compression_ratio".to_string(), compression_ratio);
        quality_metrics.insert("cognitive_load".to_string(), cognitive_load);
        quality_metrics.insert("chunk_count".to_string(), chunks_data.len() as f64);

        let _processing_time = start_time.elapsed().as_secs_f64();

        // Convert chunks_data to MemvidChunk
        let mut chunks = Vec::new();
        for (i, chunk_data) in chunks_data.iter().enumerate() {
            if let (Some(content), Some(start), Some(end)) = (
                chunk_data.get("content").and_then(|c| c.as_str()),
                chunk_data.get("start_offset").and_then(|s| s.as_u64()),
                chunk_data.get("end_offset").and_then(|e| e.as_u64()),
            ) {
                chunks.push(MemvidChunk {
                    id: format!("chunk_{}", i),
                    content: content.to_string(),
                    start_offset: start as usize,
                    end_offset: end as usize,
                });
            }
        }

        Ok((chunks, vectors))
    }

    fn calculate_cognitive_load(&self, text: &str) -> f64 {
        if text.is_empty() {
            return 0.0;
        }

        let word_count = text.split_whitespace().count() as f64;
        let _unique_words = text
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect::<std::collections::HashSet<_>>()
            .len() as f64;
        let avg_word_length = text.split_whitespace().map(|w| w.len()).sum::<usize>() as f64 / word_count.max(1.0);
        let sentence_count = text.split(&['.', '!', '?'][..]).count() as f64;
        let avg_sentence_length = word_count / sentence_count.max(1.0);

        let complex_chars = text.chars().filter(|&c| "(){}[]\"'`:;,.".contains(c)).count() as f64;
        let numbers = text.chars().filter(|c| c.is_numeric()).count() as f64;
        let capitals = text.chars().filter(|c| c.is_uppercase()).count() as f64;

        let load_score = avg_word_length * 2.0
            + avg_sentence_length * 1.5
            + (complex_chars / text.len() as f64) * 50.0
            + (numbers / word_count) * 20.0
            + (capitals / text.len() as f64) * 30.0;

        load_score.min(100.0)
    }

    fn compress_content(&self, content: &str) -> Result<(Vec<u8>, f64)> {
        if content.is_empty() {
            return Ok((vec![], 0.0));
        }

        let original_bytes = content.as_bytes();
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original_bytes)?;
        let compressed_bytes = encoder.finish()?;

        let compression_ratio = compressed_bytes.len() as f64 / original_bytes.len() as f64;
        Ok((compressed_bytes, compression_ratio))
    }

    fn analyze_taxonomical_depth(&self, text: &str) -> i32 {
        let headers = Regex::new(r"^#+\s").unwrap().find_iter(text).count() as i32;
        let numbered_lists = Regex::new(r"^\s*\d+\.").unwrap().find_iter(text).count() as i32;
        let bullet_points = Regex::new(r"^\s*[-*•]\s").unwrap().find_iter(text).count() as i32;
        let indentation_levels = Regex::new(r"^(\s*)").unwrap()
            .find_iter(text)
            .map(|m| m.as_str().len())
            .collect::<std::collections::HashSet<_>>()
            .len() as i32;

        let max_depth = headers
            .max(numbered_lists / 5)
            .max(bullet_points / 3)
            .max(indentation_levels);

        max_depth.min(10)
    }

    fn extract_dimensional_vector(&self, text: &str) -> Vec<f64> {
        if text.is_empty() {
            return vec![0.0; 10];
        }

        let word_count = text.split_whitespace().count() as f64;
        let char_count = text.len() as f64;
        let unique_words = text
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect::<std::collections::HashSet<_>>()
            .len() as f64;

        let lexical_diversity = unique_words / word_count.max(1.0);
        let punctuation_density = Regex::new(r"[.!?:;,]").unwrap().find_iter(text).count() as f64 / char_count.max(1.0);
        let content_words = Regex::new(r"\b[A-Za-z]{4,}\b").unwrap().find_iter(text).count() as f64;
        let semantic_density = content_words / word_count.max(1.0);
        let technical_terms = Regex::new(r"\b[A-Z]{2,}|\w+(?:tion|sion|ment|ness|ity)\b").unwrap().find_iter(text).count() as f64;
        let technical_density = technical_terms / word_count.max(1.0);
        let numerical_density = Regex::new(r"\d+").unwrap().find_iter(text).count() as f64 / word_count.max(1.0);
        let structure_density = Regex::new(r"\n\s*[-*•]\s|\d+\.\s").unwrap().find_iter(text).count() as f64 / char_count.max(1.0);

        vec![
            lexical_diversity,
            punctuation_density * 100.0,
            semantic_density,
            technical_density,
            numerical_density,
            structure_density * 100.0,
            word_count / 1000.0,
            char_count / 10000.0,
            (char_count / word_count.max(1.0)) - 5.0,
            (unique_words / 100.0).min(1.0),
        ]
    }

    fn extract_vectors(&self, text: &str) -> HashMap<String, Vec<f64>> {
        let chunks = self.create_memvid_chunks(text);
        let mut vectors = HashMap::new();
        for (i, chunk_data) in chunks.iter().enumerate() {
            if let Some(content) = chunk_data.get("content").and_then(|c| c.as_str()) {
                vectors.insert(format!("chunk_{}", i), self.extract_dimensional_vector(content));
            }
        }
        vectors
    }

    fn create_memvid_chunks(&self, text: &str) -> Vec<HashMap<String, serde_json::Value>> {
        if text.is_empty() {
            return vec![];
        }

        let paragraphs: Vec<&str> = text.split("\n\n").collect();
        let mut chunks = Vec::new();
        let mut current_chunk = String::new();
        let mut start_offset = 0;

        for paragraph in paragraphs {
            if current_chunk.len() + paragraph.len() > 1000 && !current_chunk.is_empty() {
                let end_offset = start_offset + current_chunk.len();
                let mut chunk_data = HashMap::new();
                chunk_data.insert("content".to_string(), serde_json::Value::String(current_chunk.clone()));
                chunk_data.insert("start_offset".to_string(), serde_json::Value::Number(start_offset.into()));
                chunk_data.insert("end_offset".to_string(), serde_json::Value::Number(end_offset.into()));
                chunks.push(chunk_data);
                start_offset = end_offset;
                current_chunk = paragraph.to_string();
            } else {
                if !current_chunk.is_empty() {
                    current_chunk.push_str("\n\n");
                }
                current_chunk.push_str(paragraph);
            }
        }

        if !current_chunk.is_empty() {
            let end_offset = start_offset + current_chunk.len();
            let mut chunk_data = HashMap::new();
            chunk_data.insert("content".to_string(), serde_json::Value::String(current_chunk));
            chunk_data.insert("start_offset".to_string(), serde_json::Value::Number(start_offset.into()));
            chunk_data.insert("end_offset".to_string(), serde_json::Value::Number(end_offset.into()));
            chunks.push(chunk_data);
        }

        chunks
    }

    fn calculate_content_hash(&self, text: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    pub fn extract_video_metadata(&self, video_path: &str) -> Result<HashMap<String, serde_json::Value>> {
        log_info(&format!("Extracting video metadata from: {}", video_path));

        // Use ffprobe to get video metadata
        let output = std::process::Command::new("ffprobe")
            .args(&[
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                video_path
            ])
            .output()
            .map_err(|e| Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("ffprobe failed: {}", e))))?;

        if !output.status.success() {
            return Err(Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::Other, "ffprobe command failed")));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let metadata: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("JSON parse failed: {}", e))))?;

        // Convert to HashMap
        if let serde_json::Value::Object(map) = metadata {
            Ok(map.into_iter().collect())
        } else {
            Err(Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, "Expected JSON object")))
        }
    }
}

#[derive(Debug, Clone)]
pub struct MemvidBridge {
    bridge: MemvidEntropicBridge,
}

impl MemvidBridge {
    pub fn new() -> Result<Self> {
        Ok(Self {
            bridge: MemvidEntropicBridge::new()?,
        })
    }

    pub fn process_document(&self, text: &str) -> Result<MemvidProcessingOutput> {
        self.bridge.process_document(text)
    }

    pub fn process_file(&self, path: &str) -> Result<MemvidProcessingOutput> {
        let text = std::fs::read_to_string(path)
            .map_err(|e| Wren3Error::Io(e))?;
        self.process_document(&text)
    }

    /// Process a text and ingest the resulting memvid document into CouchDB.
    /// Returns the created document id on success.
    pub async fn ingest_text_to_couchdb(
        &self,
        couch_client: &crate::couchdb::CouchDBClient,
        text: &str,
    ) -> Result<String> {
        // Process into chunks and vectors
        let (chunks, vectors) = self.process_document(text)?;

        // Recompute summary metrics (same heuristics as process_document)
        let cognitive_load = self.bridge.calculate_cognitive_load(text);
        let (_compressed, compression_ratio) = self.bridge.compress_content(text)?;
        let taxonomical_depth = self.bridge.analyze_taxonomical_depth(text);
        let content_hash = self.bridge.calculate_content_hash(text);

        // Call CouchDB client ingestion helper
        let doc_id = couch_client
            .ingest_memvid_document(
                chunks,
                vectors,
                cognitive_load,
                compression_ratio,
                taxonomical_depth,
                content_hash,
            )
            .await
            .map_err(|e| Wren3Error::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("CouchDB ingest failed: {}", e))))?;

        Ok(doc_id)
    }

    pub fn extract_video_metadata(&self, video_path: &str) -> Result<HashMap<String, serde_json::Value>> {
        self.bridge.extract_video_metadata(video_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memvid_bridge_creation() {
        let bridge = MemvidBridge::new();
        assert!(bridge.is_ok());
    }

    #[test]
    fn test_extract_video_metadata_nonexistent_file() {
        let bridge = MemvidBridge::new().unwrap();
        let result = bridge.extract_video_metadata("nonexistent.mp4");
        // Should fail because file doesn't exist
        assert!(result.is_err());
    }

    #[test]
    fn test_process_document_basic() {
        let bridge = MemvidBridge::new().unwrap();
        let text = "This is a test document for memvid processing.";
        let result = bridge.process_document(text);
        assert!(result.is_ok());
        
        let (chunks, vectors) = result.unwrap();
        assert!(!chunks.is_empty());
        assert!(!vectors.is_empty());
    }
}
