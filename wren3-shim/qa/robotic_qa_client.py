#!/usr/bin/env python3
"""
Robotic QA Client for CouchDB-compatible API Shim

This client performs comprehensive automated testing of the
CouchDB 1.7.2 compatible API shim with persistent memvid storage.
"""

import asyncio
import aiohttp
import json
import uuid
import time
import random
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class TestResult:
    test_name: str
    passed: bool
    duration: float
    details: str = ""

class QAReporter:
    def __init__(self):
        self.results: List[TestResult] = []
        self.start_time = None
        self.end_time = None
    
    def start_test_suite(self):
        self.start_time = time.time()
        print("="*60)
        print("STARTING COUCHDB API SHIM QA TEST SUITE")
        print("="*60)
    
    def end_test_suite(self):
        self.end_time = time.time()
        total_time = self.end_time - self.start_time
        passed_count = sum(1 for r in self.results if r.passed)
        total_count = len(self.results)
        
        print("\n" + "="*60)
        print("QA TEST SUITE COMPLETED")
        print(f"Total time: {total_time:.2f}s")
        print(f"Passed: {passed_count}/{total_count}")
        print(f"Success rate: {passed_count/total_count*100:.1f}%" if total_count > 0 else "0%")
        print("="*60)
        
        if any(not r.passed for r in self.results):
            print("\nFAILED TESTS:")
            for result in self.results:
                if not result.passed:
                    print(f"  - {result.test_name}: {result.details}")
    
    def add_result(self, result: TestResult):
        self.results.append(result)
        status = "✓ PASS" if result.passed else "✗ FAIL"
        print(f"{status} {result.test_name} ({result.duration:.2f}s)")
        if not result.passed:
            print(f"    Details: {result.details}")

class CouchDBAPIClient:
    def __init__(self, base_url: str = "http://localhost:5984"):
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def get_server_info(self) -> Dict:
        async with self.session.get(f"{self.base_url}/") as response:
            return await response.json()
    
    async def create_database(self, db_name: str) -> Dict:
        async with self.session.put(f"{self.base_url}/{db_name}") as response:
            return await response.json()
    
    async def delete_database(self, db_name: str) -> Dict:
        async with self.session.delete(f"{self.base_url}/{db_name}") as response:
            return await response.json()
    
    async def get_database_info(self, db_name: str) -> Dict:
        async with self.session.get(f"{self.base_url}/{db_name}") as response:
            return await response.json()
    
    async def put_document(self, db_name: str, doc_id: str, doc: Dict) -> Dict:
        doc["_id"] = doc_id
        async with self.session.put(f"{self.base_url}/{db_name}/{doc_id}", json=doc) as response:
            return await response.json()
    
    async def get_document(self, db_name: str, doc_id: str) -> Dict:
        async with self.session.get(f"{self.base_url}/{db_name}/{doc_id}") as response:
            return await response.json()
    
    async def delete_document(self, db_name: str, doc_id: str, rev: str) -> Dict:
        params = {"rev": rev}
        async with self.session.delete(f"{self.base_url}/{db_name}/{doc_id}", params=params) as response:
            return await response.json()
    
    async def bulk_docs(self, db_name: str, docs: List[Dict]) -> List[Dict]:
        data = {"docs": docs}
        async with self.session.post(f"{self.base_url}/{db_name}/_bulk_docs", json=data) as response:
            return await response.json()
    
    async def get_all_docs(self, db_name: str) -> Dict:
        async with self.session.get(f"{self.base_url}/{db_name}/_all_docs") as response:
            return await response.json()
    
    async def put_attachment(self, db_name: str, doc_id: str, attachment_name: str, content: bytes, content_type: str, rev: str) -> Dict:
        params = {"rev": rev}
        data = aiohttp.FormData()
        data.add_field("file", content, content_type=content_type, filename=attachment_name)
        
        async with self.session.put(
            f"{self.base_url}/{db_name}/{doc_id}/{attachment_name}",
            data=data,
            params=params
        ) as response:
            return await response.json()
    
    async def get_attachment(self, db_name: str, doc_id: str, attachment_name: str) -> bytes:
        async with self.session.get(f"{self.base_url}/{db_name}/{doc_id}/{attachment_name}") as response:
            return await response.read()
    
    async def put_design_document(self, db_name: str, design_doc_id: str, design_doc: Dict) -> Dict:
        design_doc["_id"] = f"_design/{design_doc_id}"
        async with self.session.put(f"{self.base_url}/{db_name}/_design/{design_doc_id}", json=design_doc) as response:
            return await response.json()
    
    async def query_view(self, db_name: str, design_doc_id: str, view_name: str, params: Optional[Dict] = None) -> Dict:
        url = f"{self.base_url}/{db_name}/_design/{design_doc_id}/_view/{view_name}"
        async with self.session.get(url, params=params or {}) as response:
            return await response.json()

class CouchDBQATester:
    def __init__(self, base_url: str = "http://localhost:5984"):
        self.base_url = base_url
        self.client: Optional[CouchDBAPIClient] = None
        self.reporter = QAReporter()
    
    async def run_all_tests(self):
        self.reporter.start_test_suite()
        
        async with CouchDBAPIClient(self.base_url) as client:
            self.client = client
            
            # Run all tests
            await self.test_server_info()
            await self.test_database_operations()
            await self.test_document_operations()
            await self.test_bulk_operations()
            await self.test_attachments()
            await self.test_views()
            await self.test_memvid_specific_features()
        
        self.reporter.end_test_suite()
    
    async def _run_test(self, test_name: str, test_func) -> bool:
        start_time = time.time()
        try:
            await test_func()
            duration = time.time() - start_time
            self.reporter.add_result(TestResult(test_name, True, duration))
            return True
        except Exception as e:
            duration = time.time() - start_time
            self.reporter.add_result(TestResult(test_name, False, duration, str(e)))
            return False
    
    async def test_server_info(self):
        async def test():
            info = await self.client.get_server_info()
            assert "version" in info or "couchdb" in info, "Server info should contain version info"
        
        await self._run_test("Get Server Info", test)
    
    async def test_database_operations(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            result = await self.client.create_database(db_name)
            assert result.get("ok") is True, "Database creation should succeed"
            
            # Get database info
            info = await self.client.get_database_info(db_name)
            assert info.get("db_name") == db_name, "Database name should match"
            
            # Delete database
            result = await self.client.delete_database(db_name)
            assert result.get("ok") is True, "Database deletion should succeed"
        
        await self._run_test("Database Operations", test)
    
    async def test_document_operations(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            await self.client.create_database(db_name)
            
            # Create document
            doc = {"name": "test_doc", "value": 123, "cognitive_load": 0.75}
            result = await self.client.put_document(db_name, "test_doc_1", doc)
            assert result.get("ok") is True, "Document creation should succeed"
            rev = result.get("rev")
            assert rev is not None, "Revision should be returned"
            
            # Get document
            retrieved_doc = await self.client.get_document(db_name, "test_doc_1")
            assert retrieved_doc.get("_id") == "test_doc_1", "Document ID should match"
            assert retrieved_doc.get("name") == "test_doc", "Document content should match"
            
            # Update document
            updated_doc = retrieved_doc.copy()
            updated_doc["value"] = 456
            updated_doc["cognitive_load"] = 0.85
            result = await self.client.put_document(db_name, "test_doc_1", updated_doc)
            assert result.get("ok") is True, "Document update should succeed"
            
            # Delete document
            result = await self.client.delete_document(db_name, "test_doc_1", result.get("rev"))
            assert result.get("ok") is True, "Document deletion should succeed"
            
            # Clean up
            await self.client.delete_database(db_name)
        
        await self._run_test("Document Operations", test)
    
    async def test_bulk_operations(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            await self.client.create_database(db_name)
            
            # Bulk create documents
            docs = []
            for i in range(5):
                docs.append({
                    "_id": f"bulk_doc_{i}",
                    "name": f"Document {i}",
                    "value": i,
                    "cognitive_load": 0.5 + (i * 0.1)
                })
            
            results = await self.client.bulk_docs(db_name, docs)
            assert len(results) == 5, "Should have 5 results"
            for result in results:
                assert result.get("ok") is True, "Each document should be created successfully"
            
            # Get all docs to verify
            all_docs = await self.client.get_all_docs(db_name)
            assert all_docs.get("total_rows") == 5, "Should have 5 total documents"
            
            # Clean up
            await self.client.delete_database(db_name)
        
        await self._run_test("Bulk Operations", test)
    
    async def test_attachments(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            await self.client.create_database(db_name)
            
            # Create a document first
            doc = {"name": "attachment_test"}
            result = await self.client.put_document(db_name, "attach_doc", doc)
            rev = result.get("rev")
            assert rev is not None, "Document should be created with revision"
            
            # Add attachment
            content = b"This is test attachment content"
            result = await self.client.put_attachment(
                db_name, "attach_doc", "test.txt", content, "text/plain", rev
            )
            assert result.get("ok") is True, "Attachment should be added successfully"
            new_rev = result.get("rev")
            assert new_rev is not None and new_rev != rev, "Revision should be updated"
            
            # Retrieve attachment
            retrieved_content = await self.client.get_attachment(db_name, "attach_doc", "test.txt")
            assert retrieved_content == content, "Attachment content should match"
            
            # Clean up
            await self.client.delete_database(db_name)
        
        await self._run_test("Attachments", test)
    
    async def test_views(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            await self.client.create_database(db_name)
            
            # Create documents with cognitive_load values
            docs = [
                {"_id": "doc1", "name": "Doc 1", "cognitive_load": 0.3, "compression_ratio": 0.4},
                {"_id": "doc2", "name": "Doc 2", "cognitive_load": 0.7, "compression_ratio": 0.6},
                {"_id": "doc3", "name": "Doc 3", "cognitive_load": 0.9, "compression_ratio": 0.8},
            ]
            await self.client.bulk_docs(db_name, docs)
            
            # Create design document with views
            design_doc = {
                "views": {
                    "by_cognitive_load": {
                        "map": "function(doc) { if (doc.cognitive_load) emit(doc.cognitive_load, doc); }"
                    },
                    "by_compression_ratio": {
                        "map": "function(doc) { if (doc.compression_ratio) emit(doc.compression_ratio, doc); }"
                    }
                }
            }
            result = await self.client.put_design_document(db_name, "memvid", design_doc)
            assert result.get("ok") is True, "Design document should be created successfully"
            
            # Query cognitive load view
            view_result = await self.client.query_view(db_name, "memvid", "by_cognitive_load")
            assert "rows" in view_result, "View result should have rows"
            assert len(view_result["rows"]) >= 3, "Should have at least 3 rows from our docs"
            
            # Query compression ratio view
            view_result = await self.client.query_view(db_name, "memvid", "by_compression_ratio")
            assert "rows" in view_result, "View result should have rows"
            
            # Clean up
            await self.client.delete_database(db_name)
        
        await self._run_test("Views", test)
    
    async def test_memvid_specific_features(self):
        db_name = f"test_db_{uuid.uuid4().hex[:8]}"
        
        async def test():
            # Create database
            await self.client.create_database(db_name)
            
            # Create memvid-style documents with chunks and vectors
            memvid_docs = [
                {
                    "_id": "memvid_doc_1",
                    "cognitive_load": 0.65,
                    "compression_ratio": 0.55,
                    "taxonomical_depth": 3,
                    "content_hash": "abc123def456",
                    "chunks": [
                        {"id": "chunk_0", "content": "First chunk content", "start_offset": 0, "end_offset": 19},
                        {"id": "chunk_1", "content": "Second chunk content", "start_offset": 20, "end_offset": 40}
                    ],
                    "vectors": {
                        "chunk_0": [0.1, 0.2, 0.3, 0.4, 0.5],
                        "chunk_1": [0.6, 0.7, 0.8, 0.9, 1.0]
                    }
                },
                {
                    "_id": "memvid_doc_2",
                    "cognitive_load": 0.85,
                    "compression_ratio": 0.75,
                    "taxonomical_depth": 4,
                    "content_hash": "xyz789uvw012",
                    "chunks": [
                        {"id": "chunk_0", "content": "Another chunk content", "start_offset": 0, "end_offset": 21}
                    ],
                    "vectors": {
                        "chunk_0": [0.2, 0.4, 0.6, 0.8, 1.0]
                    }
                }
            ]
            
            # Bulk insert the memvid documents
            results = await self.client.bulk_docs(db_name, memvid_docs)
            assert len(results) == 2, "Should have results for 2 documents"
            for result in results:
                assert result.get("ok") is True, "Each document should be created successfully"
            
            # Query cognitive load view
            view_result = await self.client.query_view(db_name, "memvid", "by_cognitive_load")
            assert "rows" in view_result, "View result should have rows"
            
            # Verify we have the expected data structure in the view results
            rows = view_result.get("rows", [])
            cognitive_loads = [row.get("key") for row in rows if "key" in row]
            assert len(cognitive_loads) >= 2, "Should have at least 2 cognitive load values"
            
            # Clean up
            await self.client.delete_database(db_name)
        
        await self._run_test("MemVid Specific Features", test)

async def main():
    # Create and run the QA tester
    tester = CouchDBQATester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())