#!/usr/bin/env python3
"""
Real Memvid Entropic Bridge for Document Compression and Analysis
Provides actual document compression and cognitive load analysis.
"""
import logging, hashlib, time, gzip, json, re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import subprocess

logger = logging.getLogger(__name__)

@dataclass
class MemvidCompressionResult:
    original_size: int
    compressed_size: int 
    compression_ratio: float
    cognitive_load_score: float
    dimensional_vector: List[float]
    memvid_chunks: List[Dict]
    taxonomical_depth: int
    content_hash: str
    processing_time: float
    quality_metrics: Dict

class MemvidEntropicBridge:
    def __init__(self):
        self.cache_dir = Path.home() / ".memvid_cache"
        self.cache_dir.mkdir(exist_ok=True)
        
    def calculate_cognitive_load(self, text: str) -> float:
        """Calculate real cognitive load based on text complexity"""
        if not text:
            return 0.0
            
        # Factors that increase cognitive load
        word_count = len(text.split())
        unique_words = len(set(text.lower().split()))
        avg_word_length = sum(len(word) for word in text.split()) / max(word_count, 1)
        sentence_count = len(re.split(r'[.!?]+', text))
        avg_sentence_length = word_count / max(sentence_count, 1)
        
        # Complex punctuation and formatting
        complex_chars = len(re.findall(r'[(){}\[\]"\'`:;,]', text))
        numbers = len(re.findall(r'\d+', text))
        capitals = len(re.findall(r'[A-Z]', text))
        
        # Cognitive load formula based on readability research
        load_score = (
            avg_word_length * 2.0 +           # Longer words = harder
            avg_sentence_length * 1.5 +       # Longer sentences = harder  
            (complex_chars / len(text)) * 50 + # Punctuation density
            (numbers / word_count) * 20 +      # Technical content
            (capitals / len(text)) * 30        # Acronyms/proper nouns
        )
        
        # Normalize to 0-100 scale
        return min(load_score, 100.0)
    
    def extract_dimensional_vector(self, text: str) -> List[float]:
        """Extract dimensional features from text content"""
        if not text:
            return [0.0] * 10
            
        # Calculate various text dimensions
        word_count = len(text.split())
        char_count = len(text)
        unique_words = len(set(text.lower().split()))
        
        # Lexical diversity
        lexical_diversity = unique_words / max(word_count, 1)
        
        # Syntactic complexity (approximated)
        punctuation_density = len(re.findall(r'[.!?:;,]', text)) / max(char_count, 1)
        
        # Semantic density (content words vs function words)
        content_words = len(re.findall(r'\b[A-Za-z]{4,}\b', text))
        semantic_density = content_words / max(word_count, 1)
        
        # Technical terminology density
        technical_terms = len(re.findall(r'\b[A-Z]{2,}|\w+(?:tion|sion|ment|ness|ity)\b', text))
        technical_density = technical_terms / max(word_count, 1)
        
        # Numerical content
        numerical_density = len(re.findall(r'\d+', text)) / max(word_count, 1)
        
        # Structure indicators
        structure_density = len(re.findall(r'\n\s*[-*•]\s|\d+\.\s', text)) / max(char_count, 1)
        
        return [
            lexical_diversity,
            punctuation_density * 100,
            semantic_density,
            technical_density,
            numerical_density,
            structure_density * 100,
            word_count / 1000.0,  # Document length factor
            char_count / 10000.0,  # Character density
            (char_count / max(word_count, 1)) - 5,  # Average word length offset
            min(unique_words / 100.0, 1.0)  # Vocabulary richness
        ]
    
    def compress_content(self, content: str) -> Tuple[bytes, float]:
        """Actually compress content and return compressed data + ratio"""
        if not content:
            return b"", 0.0
            
        original_bytes = content.encode('utf-8')
        compressed_bytes = gzip.compress(original_bytes)
        
        compression_ratio = len(compressed_bytes) / len(original_bytes)
        return compressed_bytes, compression_ratio
    
    def analyze_taxonomical_depth(self, text: str) -> int:
        """Analyze the taxonomical/hierarchical depth of content"""
        # Look for hierarchical indicators
        headers = len(re.findall(r'^#+\s', text, re.MULTILINE))  # Markdown headers
        numbered_lists = len(re.findall(r'^\s*\d+\.', text, re.MULTILINE))
        bullet_points = len(re.findall(r'^\s*[-*•]\s', text, re.MULTILINE))
        indentation_levels = len(set(re.findall(r'^(\s*)', text, re.MULTILINE)))
        
        # Estimate depth based on structure
        max_depth = max([
            headers,
            numbered_lists // 5,  # Group of 5 items = 1 level
            bullet_points // 3,   # Group of 3 bullets = 1 level  
            indentation_levels
        ])
        
        return min(max_depth, 10)  # Cap at reasonable depth
    
    def extract_vectors(self, text: str) -> Dict[str, List[float]]:
        """Extracts vectors for each chunk of text."""
        chunks = self.create_memvid_chunks(text)
        vectors = {}
        for i, chunk_data in enumerate(chunks):
            chunk_text = chunk_data["content"]
            vectors[f"chunk_{i}"] = self.extract_dimensional_vector(chunk_text)
        return vectors

    def create_memvid_chunks(self, text: str, chunk_size: int = 1000) -> List[Dict]:
        """Split content into meaningful chunks for processing"""
        if not text:
            return []
            
        # Split by paragraphs first, then by size if needed
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = ""
        chunk_id = 0
        
        for paragraph in paragraphs:
            if len(current_chunk) + len(paragraph) <= chunk_size:
                current_chunk += paragraph + "\n\n"
            else:
                if current_chunk.strip():
                    chunks.append({
                        "chunk_id": chunk_id,
                        "content": current_chunk.strip(),
                        "size": len(current_chunk),
                        "word_count": len(current_chunk.split()),
                        "cognitive_load": self.calculate_cognitive_load(current_chunk)
                    })
                    chunk_id += 1
                current_chunk = paragraph + "\n\n"
        
        # Add final chunk
        if current_chunk.strip():
            chunks.append({
                "chunk_id": chunk_id,
                "content": current_chunk.strip(), 
                "size": len(current_chunk),
                "word_count": len(current_chunk.split()),
                "cognitive_load": self.calculate_cognitive_load(current_chunk)
            })
        
        return chunks
    
    async def process_document(self, file_path: str) -> MemvidCompressionResult:
        """Process a single document through the memvid pipeline"""
        start_time = time.time()
        
        try:
            # Read document content
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            logger.error(f"Failed to read {file_path}: {e}")
            return self._create_error_result(file_path)
        
        # Calculate metrics
        original_size = len(content.encode('utf-8'))
        compressed_data, compression_ratio = self.compress_content(content)
        cognitive_load = self.calculate_cognitive_load(content)
        dimensional_vector = self.extract_dimensional_vector(content)
        taxonomical_depth = self.analyze_taxonomical_depth(content)
        memvid_chunks = self.create_memvid_chunks(content)
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        
        processing_time = time.time() - start_time
        
        # Quality metrics
        quality_metrics = {
            "readability_score": 100 - cognitive_load,  # Inverse of cognitive load
            "structure_score": min(taxonomical_depth * 10, 100),
            "completeness_score": min(len(content.split()) / 100, 1.0) * 100,
            "coherence_score": min(dimensional_vector[0] * 100, 100)  # Lexical diversity
        }
        
        return MemvidCompressionResult(
            original_size=original_size,
            compressed_size=len(compressed_data),
            compression_ratio=compression_ratio,
            cognitive_load_score=cognitive_load,
            dimensional_vector=dimensional_vector,
            memvid_chunks=memvid_chunks,
            taxonomical_depth=taxonomical_depth,
            content_hash=content_hash,
            processing_time=processing_time,
            quality_metrics=quality_metrics
        )
    
    def _create_error_result(self, file_path: str) -> MemvidCompressionResult:
        """Create error result for failed processing"""
        return MemvidCompressionResult(
            original_size=0,
            compressed_size=0,
            compression_ratio=0.0,
            cognitive_load_score=0.0,
            dimensional_vector=[0.0] * 10,
            memvid_chunks=[],
            taxonomical_depth=0,
            content_hash="error",
            processing_time=0.0,
            quality_metrics={"error": True}
        )
    
    async def batch_compress_archive(self, archive_path: str, max_files: int = 10) -> Dict:
        """Process real archive files instead of mock data"""
        start_time = time.time()
        archive_path_obj = Path(archive_path)
        
        if not archive_path_obj.exists():
            logger.error(f"Archive path does not exist: {archive_path}")
            return {"error": f"Archive path not found: {archive_path}"}
        
        # Find files to process
        if archive_path_obj.is_file():
            files_to_process = [archive_path_obj]
        else:
            # Find text files in directory
            extensions = ['.txt', '.md', '.json', '.py', '.js', '.html', '.xml']
            files_to_process = []
            for ext in extensions:
                files_to_process.extend(archive_path_obj.glob(f'**/*{ext}'))
                if len(files_to_process) >= max_files:
                    break
            files_to_process = files_to_process[:max_files]
        
        if not files_to_process:
            return {"error": "No processable files found in archive"}
        
        # Process each file
        results = []
        total_original_size = 0
        total_compressed_size = 0
        total_cognitive_load = 0.0
        dimensional_vectors = []
        
        for file_path in files_to_process:
            try:
                result = await self.process_document(str(file_path))
                results.append({
                    "filename": file_path.name,
                    "original_size": result.original_size,
                    "compressed_size": result.compressed_size,
                    "compression_ratio": result.compression_ratio,
                    "cognitive_load": result.cognitive_load_score,
                    "quality_metrics": result.quality_metrics,
                    "chunk_count": len(result.memvid_chunks)
                })
                
                total_original_size += result.original_size
                total_compressed_size += result.compressed_size
                total_cognitive_load += result.cognitive_load_score
                dimensional_vectors.append(result.dimensional_vector)
                
            except Exception as e:
                logger.error(f"Failed to process {file_path}: {e}")
                results.append({
                    "filename": file_path.name,
                    "error": str(e)
                })
        
        # Calculate aggregate metrics
        avg_compression_ratio = total_compressed_size / max(total_original_size, 1)
        avg_cognitive_load = total_cognitive_load / len(results)
        
        processing_time = time.time() - start_time
        
        return {
            "total_files_processed": len(results),
            "successful_files": len([r for r in results if "error" not in r]),
            "average_compression_ratio": avg_compression_ratio,
            "total_cognitive_load": total_cognitive_load,
            "average_cognitive_load": avg_cognitive_load,
            "dimensional_vectors": dimensional_vectors,
            "memvid_archives": results,
            "processing_time": processing_time,
            "archive_path": str(archive_path),
            "total_original_size": total_original_size,
            "total_compressed_size": total_compressed_size
        }

# Global bridge instance
memvid_bridge = MemvidEntropicBridge()