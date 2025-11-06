# Robotic QA Client for CouchDB-compatible API Shim

This robotic QA client provides comprehensive automated testing for the CouchDB 1.7.2 compatible API shim with persistent memvid storage. It validates all major API endpoints and verifies the memvid-specific features.

## Features

- Tests all CouchDB 1.7.2 API endpoints
- Validates memvid-specific document structures and views
- Verifies persistent storage functionality
- Comprehensive test reporting with success/failure rates

## Prerequisites

- Python 3.7+
- aiohttp (`pip install -r requirements.txt`)

## Usage

1. Start the API shim server first:

```bash
cd /path/to/wren3-shim
cargo run
```

2. Run the QA client:

```bash
cd /path/to/wren3-shim/qa
pip install -r requirements.txt
python robotic_qa_client.py
```

## Test Coverage

The QA client tests the following functionality:

### Core Database Operations
- Server info retrieval
- Database creation/deletion
- Database info retrieval

### Document Operations
- Document CRUD operations (Create, Read, Update, Delete)
- Revision handling
- Field validation

### Bulk Operations
- Bulk document creation
- Verification of bulk operation results
- All docs listing

### Attachments
- Binary attachment upload
- Attachment retrieval
- Content verification

### Views
- Design document creation
- View querying
- Filtered view queries
- Memvid-specific views (by_cognitive_load, by_compression_ratio)

### MemVid-Specific Features
- Documents with cognitive_load values
- Documents with compression_ratio values
- Chunk and vector structures
- Taxonomical depth tracking

## Output

The QA client will output a comprehensive test report showing:
- Test name and status (PASS/FAIL)
- Duration of each test
- Success rate percentage
- Details of any failed tests

## Example Output

```
============================================================
STARTING COUCHDB API SHIM QA TEST SUITE
============================================================
✓ PASS Get Server Info (0.02s)
✓ PASS Database Operations (0.05s)
✓ PASS Document Operations (0.08s)
✓ PASS Bulk Operations (0.12s)
✓ PASS Attachments (0.09s)
✓ PASS Views (0.15s)
✓ PASS MemVid Specific Features (0.18s)

============================================================
QA TEST SUITE COMPLETED
Total time: 0.69s
Passed: 7/7
Success rate: 100.0%
============================================================
```

## Extending Tests

To add more tests, you can modify the `CouchDBQATester` class in `robotic_qa_client.py` and add new test methods following the same pattern as existing tests.