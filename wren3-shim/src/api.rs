use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, put, post, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::fs;
use uuid::Uuid;

use crate::{
    blobstore::BlobStore,
    memvid_store::{Document, MemVidStore},
    models::CouchDbResponse,
};

// Query parameters for various CouchDB endpoints
#[derive(Deserialize)]
pub struct DocQuery {
    pub rev: Option<String>,
}

#[derive(Deserialize)]
pub struct ViewQuery {
    pub startkey: Option<String>,
    pub endkey: Option<String>,
    pub limit: Option<usize>,
    pub include_docs: Option<bool>,
}

// State shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub memvid_store: MemVidStore,
    pub blob_store: BlobStore,
}

pub fn router() -> Router {
    Router::new()
        // Database operations
        .route("/:db", get(get_database).put(create_database).delete(delete_database))
        .route("/:db/_all_docs", get(all_docs))
        .route("/:db/_bulk_docs", post(bulk_docs))
        
        // Document operations
        .route("/:db/:doc_id", get(get_document).put(put_document).delete(delete_document))
        
        // Attachment operations
        .route("/:db/:doc_id/:attachment", get(get_attachment).put(put_attachment))
        
        // Design document operations
        .route("/:db/_design/:ddoc", get(get_design_doc).put(put_design_doc))
        .route("/:db/_design/:ddoc/_view/:view", get(query_view))
}

// Handler for getting database info
async fn get_database(
    Path(db_name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(_db) = state.memvid_store.get_database(&db_name) {
        Ok(Json(serde_json::json!({
            "db_name": db_name,
            "doc_count": 0, // In a real implementation, this would count docs
            "update_seq": 0
        })))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for creating a database
async fn create_database(
    Path(db_name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    match state.memvid_store.create_database(&db_name).await {
        Ok(()) => Ok(Json(CouchDbResponse {
            ok: true,
            id: Some(db_name),
            rev: None,
        })),
        Err(_) => Err(StatusCode::BAD_REQUEST),
    }
}

// Handler for deleting a database
async fn delete_database(
    Path(db_name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    match state.memvid_store.delete_database(&db_name).await {
        Ok(()) => Ok(Json(CouchDbResponse {
            ok: true,
            id: Some(db_name),
            rev: None,
        })),
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

// Handler for getting all documents
async fn all_docs(
    Path(db_name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        let mut rows = Vec::new();
        
        // For a persistent store, we need to iterate through the actual stored documents
        // This would involve reading from the VFS, not just the in-memory cache
        use std::fs;
        use std::path::Path;
        
        let db_path = &db.base_path;
        if db_path.exists() {
            if let Ok(entries) = fs::read_dir(db_path) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "json") {
                            if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                                // Get document from cache or VFS
                                if let Ok(Some(doc)) = db.get_document(file_stem).await {
                                    rows.push(serde_json::json!({
                                        "id": doc.id,
                                        "key": doc.id,
                                        "value": {
                                            "rev": doc.rev
                                        }
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
        
        Ok(Json(serde_json::json!({
            "total_rows": rows.len(),
            "offset": 0,
            "rows": rows
        })))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for bulk document operations
async fn bulk_docs(
    Path(db_name): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        let mut results = Vec::new();

        // Extract docs from the payload
        if let Some(docs) = payload.get("docs").and_then(|v| v.as_array()) {
            for doc in docs {
                if let Some(id) = doc.get("_id").and_then(|v| v.as_str()) {
                    // Convert the JSON doc to our internal Document struct
                    let mut fields: HashMap<String, serde_json::Value> = 
                        serde_json::from_value(doc.clone()).unwrap_or_default();
                    
                    // Remove _id and _rev from the fields map since they're handled separately
                    fields.remove("_id");
                    fields.remove("_rev");

                    let document = Document {
                        id: id.to_string(),
                        rev: fields.remove("_rev").and_then(|v| v.as_str()).unwrap_or("1-").to_string(),
                        fields,
                        attachments: None,
                    };

                    match db.put_document(document).await {
                        Ok(updated_doc) => {
                            results.push(serde_json::json!({
                                "id": updated_doc.id,
                                "rev": updated_doc.rev,
                                "ok": true
                            }));
                        }
                        Err(err) => {
                            results.push(serde_json::json!({
                                "id": id,
                                "error": "conflict",
                                "reason": err
                            }));
                        }
                    }
                } else {
                    // Generate an ID for the document if not provided
                    let new_id = Uuid::new_v4().to_string();
                    let mut fields: HashMap<String, serde_json::Value> = 
                        serde_json::from_value(doc.clone()).unwrap_or_default();
                    
                    // Remove _id and _rev if they exist
                    fields.remove("_id");
                    fields.remove("_rev");

                    let document = Document {
                        id: new_id.clone(),
                        rev: "1-".to_string(),
                        fields,
                        attachments: None,
                    };

                    match db.put_document(document).await {
                        Ok(updated_doc) => {
                            results.push(serde_json::json!({
                                "id": updated_doc.id,
                                "rev": updated_doc.rev,
                                "ok": true
                            }));
                        }
                        Err(err) => {
                            results.push(serde_json::json!({
                                "id": new_id,
                                "error": "conflict",
                                "reason": err
                            }));
                        }
                    }
                }
            }
        }

        Ok(Json(serde_json::json!(results)))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for getting a document
async fn get_document(
    Path((db_name, doc_id)): Path<(String, String)>,
    Query(params): Query<DocQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        if let Ok(Some(doc)) = db.get_document(&doc_id).await {
            // Check revision if provided
            if let Some(rev) = params.rev {
                if doc.rev != rev {
                    return Err(StatusCode::CONFLICT);
                }
            }

            // Build the response with the document data
            let mut response = serde_json::json!({
                "_id": doc.id,
                "_rev": doc.rev
            });

            // Add the custom fields
            for (key, value) in &doc.fields {
                if let Some(obj) = response.as_object_mut() {
                    obj.insert(key.clone(), value.clone());
                }
            }

            Ok(Json(response))
        } else {
            Err(StatusCode::NOT_FOUND)
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for putting a document
async fn put_document(
    Path((db_name, doc_id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        // Extract fields from the payload
        let mut fields: HashMap<String, serde_json::Value> = 
            serde_json::from_value(payload).unwrap_or_default();
        
        // Remove _id and _rev from the fields map since they're handled separately
        fields.remove("_id");
        let rev = fields.remove("_rev").and_then(|v| v.as_str()).unwrap_or("1-").to_string();

        let document = Document {
            id: doc_id,
            rev,
            fields,
            attachments: None,
        };

        match db.put_document(document).await {
            Ok(updated_doc) => Ok(Json(CouchDbResponse {
                ok: true,
                id: Some(updated_doc.id),
                rev: Some(updated_doc.rev),
            })),
            Err(err) => {
                eprintln!("Error putting document: {}", err);
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for deleting a document
async fn delete_document(
    Path((db_name, doc_id)): Path<(String, String)>,
    Query(params): Query<DocQuery>,
    State(state): State<AppState>,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        if let Some(rev) = params.rev {
            match db.delete_document(&doc_id, &rev).await {
                Ok(()) => Ok(Json(CouchDbResponse {
                    ok: true,
                    id: Some(doc_id),
                    rev: Some(format!("{}-deleted", Uuid::new_v4().to_string().split('-').next().unwrap_or("1"))),
                })),
                Err(_) => Err(StatusCode::CONFLICT),
            }
        } else {
            Err(StatusCode::BAD_REQUEST)
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for getting an attachment
async fn get_attachment(
    Path((db_name, doc_id, attachment_name)): Path<(String, String, String)>,
    State(state): State<AppState>,
) -> Result<Vec<u8>, StatusCode> {
    // In a real implementation, this would fetch the attachment from the blob store
    // For now, we'll return a placeholder
    if let Some(_blob) = state.blob_store.get_attachment(&db_name, &doc_id, &attachment_name).await {
        // Return the blob content
        // This is simplified - in reality, we'd need to return the content with proper headers
        Ok(vec![0, 1, 2, 3]) // Placeholder
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for putting an attachment
async fn put_attachment(
    Path((db_name, doc_id, attachment_name)): Path<(String, String, String)>,
    Query(params): Query<DocQuery>,
    State(state): State<AppState>,
    body: axum::body::Bytes,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        // First, verify the document exists and has the correct rev
        if let Some(doc) = db.get_document(&doc_id) {
            if let Some(expected_rev) = &params.rev {
                if doc.rev != *expected_rev {
                    return Err(StatusCode::CONFLICT);
                }
            }
        } else {
            return Err(StatusCode::NOT_FOUND);
        }

        // Store the attachment in the blob store
        if let Err(_) = state
            .blob_store
            .put_attachment(&db_name, &doc_id, &attachment_name, body.to_vec())
            .await
        {
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }

        // Return updated document info
        Ok(Json(CouchDbResponse {
            ok: true,
            id: Some(doc_id),
            rev: Some(format!("{}-att", Uuid::new_v4().to_string().split('-').next().unwrap_or("1"))),
        }))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for getting a design document
async fn get_design_doc(
    Path((db_name, ddoc_id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        // Design doc IDs have the format _design/{name}
        let full_ddoc_id = if ddoc_id.starts_with("_design/") {
            ddoc_id
        } else {
            format!("_design/{}", ddoc_id)
        };

        if let Ok(Some(ddoc)) = db.get_design_document(&full_ddoc_id).await {
            Ok(Json(serde_json::json!({
                "_id": ddoc.id,
                "_rev": ddoc.rev,
                "views": ddoc.views,
                "language": ddoc.language
            })))
        } else {
            Err(StatusCode::NOT_FOUND)
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

// Handler for putting a design document
async fn put_design_doc(
    Path((db_name, ddoc_id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<CouchDbResponse>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        // Extract fields from the payload
        let mut fields: HashMap<String, serde_json::Value> = 
            serde_json::from_value(payload).unwrap_or_default();
        
        // Remove _id and _rev from the fields map since they're handled separately
        fields.remove("_id");
        let rev = fields.remove("_rev").and_then(|v| v.as_str()).unwrap_or("1-").to_string();

        // Extract views from the fields
        let views: HashMap<String, crate::memvid_store::View> = 
            if let Some(views_val) = fields.get("views").cloned() {
                serde_json::from_value(views_val).unwrap_or_default()
            } else {
                HashMap::new()
            };

        // Extract language
        let language: Option<String> = 
            fields.get("language").and_then(|v| v.as_str()).map(|s| s.to_string());

        let ddoc = crate::memvid_store::DesignDocument {
            id: if ddoc_id.starts_with("_design/") {
                ddoc_id
            } else {
                format!("_design/{}", ddoc_id)
            },
            rev,
            views,
            language,
        };

        match db.put_design_document(ddoc).await {
            Ok(updated_ddoc) => Ok(Json(CouchDbResponse {
                ok: true,
                id: Some(updated_ddoc.id),
                rev: Some(updated_ddoc.rev),
            })),
            Err(err) => {
                eprintln!("Error putting design document: {}", err);
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

use crate::views;

// Handler for querying a view
async fn query_view(
    Path((db_name, ddoc_name, view_name)): Path<(String, String, String)>,
    Query(params): Query<ViewQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(db) = state.memvid_store.get_database(&db_name) {
        // Design doc IDs have the format _design/{name}
        let full_ddoc_id = if ddoc_name.starts_with("_design/") {
            ddoc_name
        } else {
            format!("_design/{}", ddoc_name)
        };

        if let Ok(Some(ddoc)) = db.get_design_document(&full_ddoc_id).await {
            if let Some(_view) = ddoc.views.get(&view_name) {
                // Execute the map function for each document in the database
                let mut rows: Vec<serde_json::Value> = Vec::new();
                
                // For persistent VFS store, iterate through actual stored documents
                use std::fs;
                use std::path::Path;
                
                let db_path = &db.base_path;
                if db_path.exists() {
                    if let Ok(entries) = fs::read_dir(db_path) {
                        for entry in entries {
                            if let Ok(entry) = entry {
                                let path = entry.path();
                                if path.extension().map_or(false, |ext| ext == "json") {
                                    if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                                        // Get document from cache or VFS
                                        if let Ok(Some(doc)) = db.get_document(file_stem).await {
                                            // Process the document according to the view type
                                            if view_name == "by_cognitive_load" {
                                                if let Some(cognitive_load) = doc.fields.get("cognitive_load").and_then(|v| v.as_f64()) {
                                                    // Apply filters if provided
                                                    let include_row = 
                                                        if let Some(start_key) = &params.startkey {
                                                            cognitive_load >= start_key.parse().unwrap_or(f64::NEG_INFINITY)
                                                        } else { true } &&
                                                        if let Some(end_key) = &params.endkey {
                                                            cognitive_load <= end_key.parse().unwrap_or(f64::INFINITY)
                                                        } else { true };
                                                    
                                                    if include_row {
                                                        rows.push(serde_json::json!({
                                                            "id": doc.id,
                                                            "key": cognitive_load,
                                                            "value": {
                                                                "id": doc.id,
                                                                "chunk_id": doc.fields.get("chunks").and_then(|chunks| 
                                                                    chunks.as_array().and_then(|arr| 
                                                                        arr.first().and_then(|c| 
                                                                            c.as_object().and_then(|c_obj| 
                                                                                c_obj.get("id").and_then(|id_val| id_val.as_str())
                                                                            )
                                                                        )
                                                                    )
                                                                ).unwrap_or("chunk_0"),
                                                                "vector": doc.fields.get("vectors").map(|v| v.clone()).unwrap_or(serde_json::Value::Array(vec![])),
                                                                "cognitive_load": cognitive_load,
                                                                "content": doc.fields.get("chunks").and_then(|chunks| 
                                                                    chunks.as_array().and_then(|arr| 
                                                                        arr.first().and_then(|c| 
                                                                            c.as_object().and_then(|c_obj| 
                                                                                c_obj.get("content").and_then(|content_val| content_val.as_str())
                                                                            )
                                                                        )
                                                                    )
                                                                ).unwrap_or(""),
                                                            }
                                                        }));
                                                    }
                                                }
                                            } else if view_name == "by_compression_ratio" {
                                                if let Some(compression_ratio) = doc.fields.get("compression_ratio").and_then(|v| v.as_f64()) {
                                                    // Apply filters if provided
                                                    let include_row = 
                                                        if let Some(start_key) = &params.startkey {
                                                            compression_ratio >= start_key.parse().unwrap_or(f64::NEG_INFINITY)
                                                        } else { true } &&
                                                        if let Some(end_key) = &params.endkey {
                                                            compression_ratio <= end_key.parse().unwrap_or(f64::INFINITY)
                                                        } else { true };
                                                    
                                                    if include_row {
                                                        rows.push(serde_json::json!({
                                                            "id": doc.id,
                                                            "key": compression_ratio,
                                                            "value": {
                                                                "id": doc.id,
                                                                "chunk_id": doc.fields.get("chunks").and_then(|chunks| 
                                                                    chunks.as_array().and_then(|arr| 
                                                                        arr.first().and_then(|c| 
                                                                            c.as_object().and_then(|c_obj| 
                                                                                c_obj.get("id").and_then(|id_val| id_val.as_str())
                                                                            )
                                                                        )
                                                                    )
                                                                ).unwrap_or("chunk_0"),
                                                                "vector": doc.fields.get("vectors").map(|v| v.clone()).unwrap_or(serde_json::Value::Array(vec![])),
                                                                "compression_ratio": compression_ratio,
                                                                "content": doc.fields.get("chunks").and_then(|chunks| 
                                                                    chunks.as_array().and_then(|arr| 
                                                                        arr.first().and_then(|c| 
                                                                            c.as_object().and_then(|c_obj| 
                                                                                c_obj.get("content").and_then(|content_val| content_val.as_str())
                                                                            )
                                                                        )
                                                                    )
                                                                ).unwrap_or(""),
                                                            }
                                                        }));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Apply sorting - CouchDB views are sorted by key
                rows.sort_by(|a, b| {
                    let key_a = a.get("key").map(|k| k.to_string()).unwrap_or_default();
                    let key_b = b.get("key").map(|k| k.to_string()).unwrap_or_default();
                    key_a.cmp(&key_b)
                });
                
                // Apply limit if specified
                if let Some(limit) = params.limit {
                    rows.truncate(limit);
                }
                
                Ok(Json(serde_json::json!({
                    "total_rows": rows.len(),
                    "offset": 0,
                    "rows": rows
                })))
            } else {
                Err(StatusCode::NOT_FOUND)
            }
        } else {
            Err(StatusCode::NOT_FOUND)
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}