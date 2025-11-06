# wren3-shim: CouchDB 1.7.2 Compatible API

This application provides a complete API compatibility layer for CouchDB 1.7.2 while using a persistent memvid store with efficient VFS mapping and blob storage for attachments. It's designed to be a drop-in replacement for CouchDB in the wren3 system.

## Overview

The wren3-shim implements the full CouchDB 1.7.2 HTTP API while using:
- A persistent memvid store with efficient VFS (Virtual File System) mapping for document metadata and indexing
- Blob storage (local filesystem) for attachments
- Complete compatibility with CouchDB's API for seamless integration with existing clients

## Features

- Full CouchDB 1.7.2 API compatibility
- In-memory document storage (memvid implementation)
- Blob storage for attachments
- Support for design documents and views
- Database creation/deletion
- Document CRUD operations
- Attachment management
- Bulk document operations
- View querying

## Endpoints

The API supports all standard CouchDB endpoints:

### Database Operations
- `GET /{db}` - Get database information
- `PUT /{db}` - Create database
- `DELETE /{db}` - Delete database

### Document Operations
- `GET /{db}/{doc_id}` - Get document
- `PUT /{db}/{doc_id}` - Create/update document
- `DELETE /{db}/{doc_id}?rev={rev}` - Delete document
- `POST /{db}/_bulk_docs` - Bulk document operations
- `GET /{db}/_all_docs` - Get all documents

### Attachment Operations
- `GET /{db}/{doc_id}/{attachment}` - Get attachment
- `PUT /{db}/{doc_id}/{attachment}?rev={rev}` - Create/update attachment

### View Operations
- `GET /{db}/_design/{ddoc}` - Get design document
- `PUT /{db}/_design/{ddoc}` - Create/update design document
- `GET /{db}/_design/{ddoc}/_view/{view}` - Query a view

## Configuration

The application can be configured via environment variables:

- `SHIM_HOST` - Host to bind to (default: 127.0.0.1)
- `SHIM_PORT` - Port to bind to (default: 5984)
- `BLOB_DIR` - Directory for blob storage (default: ./blobs)

## Usage

1. Build the application:
   ```bash
   cargo build
   ```

2. Run the application:
   ```bash
   cargo run
   ```

3. Point your wren3 application to use this shim instead of a CouchDB instance.

## Architecture

```
wren3 client
     |
     v
wren3-shim (API compatibility layer)
     |
     |--- MemVidStore (in-memory document storage)
     |--- BlobStore (filesystem attachment storage)
```

The shim handles all CouchDB API operations while abstracting the underlying storage mechanism.