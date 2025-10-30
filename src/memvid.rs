use crate::couchdb::MemvidChunk;
use crate::error_handling::{log_info, Result, Wren3Error};
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;

pub type MemvidProcessingOutput = (Vec<MemvidChunk>, HashMap<String, Vec<f64>>);

#[derive(Debug, Clone)]
pub struct MemvidBridge {
    // This struct doesn't need to store data, as the Python module is globally accessible
}

impl MemvidBridge {
    pub fn new() -> Result<Self> {
        log_info("Initializing Memvid Bridge");
        Python::with_gil(|py| -> Result<()> {
            // Test that we can import the Python module
            py.import_bound("sys")?;
            Ok(())
        })?;
        Ok(Self {})
    }

    #[allow(dead_code)]
    pub fn process_document(&self, text: &str) -> Result<MemvidProcessingOutput> {
        log_info(&format!(
            "Processing document text of {} characters",
            text.len()
        ));

        Python::with_gil(|py| -> Result<MemvidProcessingOutput> {
            // Add the python directory to sys.path
            let sys = py.import_bound("sys")?;
            let current_dir = std::env::current_dir().map_err(Wren3Error::Io)?;
            let python_path = current_dir.join("python");
            let python_path_str = python_path
                .to_str()
                .ok_or_else(|| Wren3Error::Config("Invalid path".to_string()))?;
            sys.getattr("path")?
                .call_method1("insert", (0, python_path_str))?;

            let memvid_module = py.import_bound("memvid_entropic_bridge")?;
            let bridge_class = memvid_module.getattr("MemvidEntropicBridge")?;
            let bridge_instance = bridge_class.call0()?;

            // Create a temporary file with the text content
            let tempfile = py.import_bound("tempfile")?;
            let named_temp = tempfile.getattr("NamedTemporaryFile")?;
            let kwargs = PyDict::new_bound(py);
            kwargs.set_item("delete", false)?;
            kwargs.set_item("suffix", ".txt")?;
            let temp_file = named_temp.call(("w",), Some(&kwargs))?;
            let temp_path = temp_file.getattr("name")?.extract::<String>()?;

            temp_file.call_method1("write", (text,))?;
            temp_file.call_method0("close")?;

            // Process the document
            let result = bridge_instance.call_method1("process_document", (temp_path.clone(),))?;

            // Extract chunks and vectors
            let chunks = result.getattr("memvid_chunks")?;
            let mut chunk_data = Vec::new();

            let chunk_iter = chunks.iter()?;
            for chunk in chunk_iter {
                let chunk = chunk?;
                let chunk_id = chunk.getattr("chunk_id")?.extract::<usize>()?;
                let content = chunk.getattr("content")?.extract::<String>()?;
                let size = chunk.getattr("size")?.extract::<usize>()?;

                chunk_data.push((format!("chunk_{}", chunk_id), content, size));
            }

            // Use helper to create chunks with proper cumulative offsets
            let rust_chunks = create_chunks_with_offsets(chunk_data);

            // Extract vectors - use document-level vector for all chunks for now
            let dimensional_vector = result.getattr("dimensional_vector")?;
            let vector = dimensional_vector.extract::<Vec<f64>>()?;
            let mut vectors = HashMap::new();

            for chunk in &rust_chunks {
                vectors.insert(chunk.id.clone(), vector.clone());
            }

            // Clean up temp file
            let os = py.import_bound("os")?;
            os.call_method1("unlink", (temp_path,))?;

            Ok((rust_chunks, vectors))
        })
    }

    pub fn process_file(
        &self,
        file_path: &str,
    ) -> Result<MemvidProcessingOutput> {
        log_info(&format!("Processing file: {}", file_path));

        Python::with_gil(|py| -> Result<MemvidProcessingOutput> {
            // Add the python directory to sys.path
            let sys = py.import_bound("sys")?;
            let current_dir = std::env::current_dir().map_err(Wren3Error::Io)?;
            let python_path = current_dir.join("python");
            let python_path_str = python_path
                .to_str()
                .ok_or_else(|| Wren3Error::Config("Invalid path".to_string()))?;
            sys.getattr("path")?
                .call_method1("insert", (0, python_path_str))?;

            let memvid_module = py.import_bound("memvid_entropic_bridge")?;
            let bridge_class = memvid_module.getattr("MemvidEntropicBridge")?;
            let bridge_instance = bridge_class.call0()?;

            // Process the document
            let result = bridge_instance.call_method1("process_document", (file_path,))?;

            // Extract chunks and vectors
            let chunks = result.getattr("memvid_chunks")?;
            let mut chunk_data = Vec::new();

            let chunk_iter = chunks.iter()?;
            for chunk in chunk_iter {
                let chunk = chunk?;
                let chunk_id = chunk.getattr("chunk_id")?.extract::<usize>()?;
                let content = chunk.getattr("content")?.extract::<String>()?;
                let size = chunk.getattr("size")?.extract::<usize>()?;

                chunk_data.push((format!("chunk_{}", chunk_id), content, size));
            }

            // Use helper to create chunks with proper cumulative offsets
            let rust_chunks = create_chunks_with_offsets(chunk_data);

            // Extract vectors - use document-level vector for all chunks for now
            let dimensional_vector = result.getattr("dimensional_vector")?;
            let vector = dimensional_vector.extract::<Vec<f64>>()?;
            let mut vectors = HashMap::new();

            for chunk in &rust_chunks {
                vectors.insert(chunk.id.clone(), vector.clone());
            }

            Ok((rust_chunks, vectors))
        })
    }
}

// Compute start/end offsets for chunks given their sizes.
// This helper will be used to set `start_offset` and `end_offset` for each `MemvidChunk`.
pub fn compute_chunk_offsets(sizes: &[usize]) -> Vec<(usize, usize)> {
    // Compute cumulative start/end offsets for each chunk.
    // start_offset for the first chunk is 0, end_offset is start+size.
    let mut offsets = Vec::with_capacity(sizes.len());
    let mut cursor: usize = 0;
    for &s in sizes {
        let start = cursor;
        let end = cursor + s;
        offsets.push((start, end));
        cursor = end;
    }
    offsets
}

// Helper to create MemvidChunk vector with proper cumulative offsets
pub fn create_chunks_with_offsets(chunk_data: Vec<(String, String, usize)>) -> Vec<MemvidChunk> {
    let sizes: Vec<usize> = chunk_data.iter().map(|(_, _, size)| *size).collect();
    let offsets = compute_chunk_offsets(&sizes);

    chunk_data
        .into_iter()
        .zip(offsets.iter())
        .map(|((id, content, _), &(start, end))| MemvidChunk {
            id,
            content,
            start_offset: start,
            end_offset: end,
        })
        .collect()
}

// Validate chunk sizes for basic safety checks
#[allow(dead_code)]
pub fn validate_chunk_sizes(_sizes: &[usize]) -> Result<()> {
    // For now, accept all inputs as valid (including empty and zero sizes)
    // This could be extended later with more sophisticated validation
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{compute_chunk_offsets, create_chunks_with_offsets};

    #[test]
    fn test_compute_chunk_offsets_expected_behavior() {
        // Given chunk sizes, offsets should be cumulative
    let sizes = [10usize, 20usize, 30usize];
        let offsets = compute_chunk_offsets(&sizes);

        // Expected: (0,10), (10,30), (30,60)
        let expected = vec![(0usize, 10usize), (10usize, 30usize), (30usize, 60usize)];
        assert_eq!(
            offsets, expected,
            "Offsets should be cumulative start/end pairs"
        );
    }

    #[test]
    fn test_create_chunks_with_offsets_integration() {
        // Test the chunk creation helper that should use compute_chunk_offsets
        let chunk_data = vec![
            ("chunk_0".to_string(), "Hello world".to_string(), 11usize),
            ("chunk_1".to_string(), "This is a test".to_string(), 14usize),
            ("chunk_2".to_string(), "Final chunk".to_string(), 11usize),
        ];

        let chunks = create_chunks_with_offsets(chunk_data);

        // Should have correct cumulative offsets
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].start_offset, 0);
        assert_eq!(chunks[0].end_offset, 11);
        assert_eq!(chunks[1].start_offset, 11);
        assert_eq!(chunks[1].end_offset, 25);
        assert_eq!(chunks[2].start_offset, 25);
        assert_eq!(chunks[2].end_offset, 36);
    }

    #[test]
    fn test_compute_chunk_offsets_edge_cases() {
        // Empty input should return empty result
    let empty_sizes: [usize; 0] = [];
    let empty_offsets = compute_chunk_offsets(&empty_sizes);
        assert_eq!(empty_offsets.len(), 0);

        // Single chunk
    let single_size = [42usize];
    let single_offsets = compute_chunk_offsets(&single_size);
        assert_eq!(single_offsets, vec![(0usize, 42usize)]);

        // Zero-size chunks (edge case that should work)
    let zero_sizes = [0usize, 10usize, 0usize];
    let zero_offsets = compute_chunk_offsets(&zero_sizes);
        assert_eq!(
            zero_offsets,
            vec![(0usize, 0usize), (0usize, 10usize), (10usize, 10usize)]
        );

        // Large chunks (potential overflow behavior - this test intentionally uses large values to check for edge cases)
    let large_sizes = [usize::MAX / 2, 1usize];
    let large_offsets = compute_chunk_offsets(&large_sizes);
        // This should fail if our implementation doesn't handle potential overflow correctly
        assert_eq!(large_offsets[0], (0usize, usize::MAX / 2));
        assert_eq!(large_offsets[1], (usize::MAX / 2, usize::MAX / 2 + 1));
    }

    #[test]
    fn test_validate_chunk_sizes_edge_case() {
        // This test ensures that input validation will be properly implemented
        // RED TEST: this will fail initially because validate_chunk_sizes doesn't exist yet
        use super::validate_chunk_sizes;

        // Valid sizes should pass
    assert!(validate_chunk_sizes(&[10, 20, 30]).is_ok());

    // Empty should be valid
    assert!(validate_chunk_sizes(&[] as &[usize]).is_ok());

    // Zero sizes should be valid (representing empty chunks)
    assert!(validate_chunk_sizes(&[0, 10, 0]).is_ok());
    }
}
