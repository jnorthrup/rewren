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
use serde::Deserialize;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{hash_map::Entry, HashMap};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, RwLock};
use uuid::Uuid;

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

#[derive(Clone)]
struct AppState {
    databases: StubDatabases,
}

pub struct TestCouchStub {
    addr: SocketAddr,
    shutdown: Option<oneshot::Sender<()>>,
}

impl TestCouchStub {
    pub async fn spawn() -> Self {
        let state = AppState {
            databases: StubDatabases::default(),
        };

        let router = Router::new()
            .route("/:db", put(put_database).post(post_document))
            .route("/:db/_bulk_docs", post(post_bulk_docs))
            .route("/:db/_all_docs", get(get_all_docs).post(post_all_docs))
            .route("/:db/_changes", get(get_changes))
            .route(
                "/:db/_design/:design_doc",
                get(get_design_doc).post(post_design_doc),
            )
            .route(
                "/:db/_design/:design_doc/_view/:view_name",
                get(get_view).post(post_view),
            )
            .route(
                "/:db/:doc_id/:attachment",
                get(get_attachment)
                    .put(put_attachment)
                    .delete(delete_attachment),
            )
            .route(
                "/:db/:doc_id",
                get(get_document).delete(delete_document).put(put_document),
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

    pub fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

impl StubDatabases {
    async fn ensure_database(&self, name: &str) {
        let mut guard = self.inner.write().await;
        guard
            .entry(name.to_string())
            .or_insert_with(DbState::default);
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

    async fn collect_rows(&self, db: &str, metric_field: &str) -> Vec<serde_json::Value> {
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
            let metric_value = doc
                .get(metric_field)
                .cloned()
                .unwrap_or(serde_json::Value::Null);

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
        let db_entry = guard.entry(db.to_string()).or_insert_with(DbState::default);

        let id = override_id
            .or_else(|| {
                doc.get("_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let incoming_rev = doc
            .get("_rev")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
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

fn next_revision(current_rev: Option<&str>) -> String {
    match current_rev {
        Some(rev) => {
            let mut parts = rev.splitn(2, '-');
            let version = parts
                .next()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(1);
            let suffix = parts.next().unwrap_or("stub");
            format!("{}-{}", version + 1, suffix)
        }
        None => "1-stub".to_string(),
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
    match state.databases.apply_document(&db, doc, None, true).await {
        Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => (
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
            Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => {
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

    (StatusCode::CREATED, Json(serde_json::Value::Array(results)))
}

async fn get_all_docs(
    Path(db): Path<String>,
    Query(params): Query<AllDocsQuery>,
    State(state): State<AppState>,
) -> (StatusCode, Json<serde_json::Value>) {
    let include_docs = params.include_docs.unwrap_or(false);
    let docs = state.databases.all_docs(&db).await;

    let rows = build_all_docs_rows(docs, include_docs);

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "total_rows": rows.len(),
            "offset": 0,
            "rows": rows,
        })),
    )
}

async fn post_all_docs(
    Path(db): Path<String>,
    Query(params): Query<AllDocsQuery>,
    State(state): State<AppState>,
    Json(payload): Json<AllDocsPostPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    let AllDocsPostPayload { keys, include_docs } = payload;
    let include_docs = include_docs.unwrap_or_else(|| params.include_docs.unwrap_or(false));

    let mut rows = Vec::new();
    for key in keys {
        if let Some(doc) = state.databases.get_document(&db, &key).await {
            let rev = doc.get("_rev").and_then(|v| v.as_str()).unwrap_or("1-stub");

            let mut row = serde_json::json!({
                "id": key,
                "key": key,
                "value": { "rev": rev },
            });

            if include_docs {
                row["doc"] = doc;
            }

            rows.push(row);
        } else {
            rows.push(serde_json::json!({
                "key": key,
                "error": "not_found",
            }));
        }
    }

    let total_rows = rows.len();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "total_rows": total_rows,
            "offset": 0,
            "rows": rows,
        })),
    )
}

fn build_all_docs_rows(
    docs: Vec<(String, serde_json::Value)>,
    include_docs: bool,
) -> Vec<serde_json::Value> {
    let mut rows = Vec::new();
    for (id, doc) in docs {
        let rev = doc.get("_rev").and_then(|v| v.as_str()).unwrap_or("1-stub");

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
    rows
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
        Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => (
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

#[derive(Default, Clone)]
struct ViewOptions {
    limit: Option<usize>,
    skip: Option<usize>,
    startkey: Option<Value>,
    endkey: Option<Value>,
    key: Option<Value>,
    keys: Option<Vec<Value>>,
    descending: bool,
}

impl ViewOptions {
    fn apply_pair(&mut self, key: &str, value: &str) {
        match key {
            "limit" => self.limit = parse_positive_usize(value),
            "skip" => self.skip = parse_positive_usize(value),
            "startkey" => self.startkey = Some(parse_json_param(value)),
            "endkey" => self.endkey = Some(parse_json_param(value)),
            "key" => self.key = Some(parse_json_param(value)),
            "keys" => {
                if let Value::Array(items) = parse_json_param(value) {
                    self.keys = Some(items);
                }
            }
            "descending" => self.descending = value.eq_ignore_ascii_case("true"),
            _ => {}
        }
    }
}

async fn get_view(
    Path((db, design_doc, view_name)): Path<(String, String, String)>,
    Query(params): Query<RevisionQuery>,
    State(state): State<AppState>,
) -> (StatusCode, Json<serde_json::Value>) {
    let metric = match view_name.as_str() {
        "by_compression_ratio" => "compression_ratio",
        _ => "cognitive_load",
    };

    let mut options = ViewOptions::default();
    options.limit = params.limit;
    options.skip = params.skip;
    options.startkey = params.startkey.map(|s| parse_json_param(&s));
    options.endkey = params.endkey.map(|s| parse_json_param(&s));
    options.key = params.key.map(|s| parse_json_param(&s));
    if let Some(keys_str) = params.keys {
        if let Value::Array(items) = parse_json_param(&keys_str) {
            options.keys = Some(items);
        }
    }
    options.descending = params.descending.unwrap_or(false);

    respond_with_view(&db, &design_doc, &view_name, metric, &options, &state).await
}

async fn post_view(
    Path((db, design_doc, view_name)): Path<(String, String, String)>,
    Query(params): Query<RevisionQuery>,
    State(state): State<AppState>,
    Json(payload): Json<ViewPostPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    let metric = match view_name.as_str() {
        "by_compression_ratio" => "compression_ratio",
        _ => "cognitive_load",
    };

    let mut options = ViewOptions::default();
    options.limit = params.limit;
    options.skip = params.skip;
    options.startkey = params.startkey.map(|s| parse_json_param(&s));
    options.endkey = params.endkey.map(|s| parse_json_param(&s));
    options.key = params.key.map(|s| parse_json_param(&s));
    if let Some(keys_str) = params.keys {
        if let Value::Array(items) = parse_json_param(&keys_str) {
            options.keys = Some(items);
        }
    }
    options.descending = params.descending.unwrap_or(false);

    if let Some(keys) = payload.keys {
        options.keys = Some(keys);
    }

    respond_with_view(&db, &design_doc, &view_name, metric, &options, &state).await
}

async fn respond_with_view(
    db: &str,
    design_doc: &str,
    view_name: &str,
    metric: &str,
    options: &ViewOptions,
    state: &AppState,
) -> (StatusCode, Json<serde_json::Value>) {
    // Check if this is a special memvid-specific view or a general view
    let is_memvid_view = matches!(
        view_name,
        "by_cognitive_load" | "by_compression_ratio" | "by_taxonomical_depth"
    );

    let mut rows = if is_memvid_view {
        // For existing memvid views, use the original logic
        state
            .databases
            .collect_rows(db, metric)
            .await
            .into_iter()
            .filter(|row| {
                row["id"]
                    .as_str()
                    .map(|id| !id.starts_with("_design/"))
                    .unwrap_or(true)
            })
            .collect::<Vec<_>>()
    } else {
        // For general views, try to execute a map function if it exists
        let mut result_rows = Vec::new();

        // First, get the design document to retrieve the map function
        let design_doc_id = format!("_design/{}", design_doc);
        if let Some(design_doc) = state.databases.get_document(db, &design_doc_id).await {
            // Get all documents in the database
            let docs = state.databases.all_docs(db).await;

            for (doc_id, doc) in docs {
                // Skip design documents
                if doc_id.starts_with("_design/") {
                    continue;
                }

                // Process the document with our provider-specific view logic
                if view_name == "by_provider" {
                    if let Some(providers) = doc.get("providers").and_then(|p| p.as_object()) {
                        for (provider_name, provider_data) in providers {
                            result_rows.push(serde_json::json!({
                                "id": doc_id,
                                "key": provider_name,
                                "value": provider_data
                            }));
                        }
                    }
                } else {
                    // For other potential views, we could implement similar logic
                    // For now, just emit the doc if the view name matches something else
                }
            }
        }

        result_rows
    };

    rows.sort_by(|a, b| match (a.get("key"), b.get("key")) {
        (Some(left), Some(right)) => compare_json_keys(left, right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    });

    rows.retain(|row| {
        let Some(key) = row.get("key") else {
            return true;
        };
        key_within_bounds(key, options) && key_matches_exact_filters(key, options)
    });

    if options.descending {
        rows.reverse();
    }

    if let Some(skip) = options.skip {
        if skip >= rows.len() {
            rows.clear();
        } else {
            rows.drain(0..skip);
        }
    }

    if let Some(limit) = options.limit {
        rows.truncate(limit);
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "total_rows": rows.len(),
            "offset": 0,
            "rows": rows,
            "_id": format!("_design/{}/_view/{}", design_doc, view_name),
            "_rev": "1-stub-view",
        })),
    )
}

async fn get_document(
    Path((db, doc_id)): Path<(String, String)>,
    Query(params): Query<RevisionQuery>,
    State(state): State<AppState>,
) -> (StatusCode, Json<serde_json::Value>) {
    if let Some((design_doc, view_name, inline_query)) = decode_view_request(&doc_id) {
        let metric = match view_name.as_str() {
            "by_compression_ratio" => "compression_ratio",
            _ => "cognitive_load",
        };
        let mut options = ViewOptions::default();

        for (key, value) in parse_inline_pairs(inline_query.as_deref()) {
            options.apply_pair(&key, &value);
        }

        if let Some(limit) = params.limit.filter(|value| *value > 0) {
            options.limit = Some(limit);
        }

        if let Some(skip) = params.skip.filter(|value| *value > 0) {
            options.skip = Some(skip);
        }

        if let Some(ref startkey) = params.startkey {
            options.startkey = Some(parse_json_param(startkey));
        }

        if let Some(ref endkey) = params.endkey {
            options.endkey = Some(parse_json_param(endkey));
        }

        if let Some(descending) = params.descending {
            options.descending = descending;
        }

        if let Some(ref key) = params.key {
            options.key = Some(parse_json_param(key));
        }

        if let Some(ref keys) = params.keys {
            if let Value::Array(items) = parse_json_param(keys) {
                options.keys = Some(items);
            }
        }

        return respond_with_view(&db, &design_doc, &view_name, metric, &options, &state).await;
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

    let current_rev = doc.get("_rev").and_then(|v| v.as_str()).unwrap_or("1-stub");

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
    let mut doc = doc;
    doc["_id"] = serde_json::Value::String(doc_id.clone());

    match state
        .databases
        .apply_document(&db, doc, Some(doc_id.clone()), true)
        .await
    {
        Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => (
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

async fn get_attachment(
    Path((db, doc_id, attachment)): Path<(String, String, String)>,
    State(state): State<AppState>,
) -> Response {
    let Some(doc) = state.databases.get_document(&db, &doc_id).await else {
        return not_found_response();
    };

    let Some(attachments) = doc.get("_attachments").and_then(|v| v.as_object()) else {
        return not_found_response();
    };

    let Some(attachment_obj) = attachments.get(&attachment) else {
        return not_found_response();
    };

    let Some(data) = attachment_obj
        .get("data")
        .and_then(|v| v.as_str())
        .and_then(|data| BASE64.decode(data.as_bytes()).ok())
    else {
        return not_found_response();
    };

    let mut response = Response::new(Body::from(data));
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/plain"));

    response
}

async fn put_attachment(
    Path((db, doc_id, attachment)): Path<(String, String, String)>,
    headers: HeaderMap,
    State(state): State<AppState>,
    body: Bytes,
) -> (StatusCode, Json<serde_json::Value>) {
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");

    let existing_doc = match state.databases.get_document(&db, &doc_id).await {
        Some(doc) => doc,
        None => return (StatusCode::NOT_FOUND, Json(not_found())),
    };

    let current_rev = existing_doc
        .get("_rev")
        .and_then(|v| v.as_str())
        .unwrap_or("1-stub");

    let rev = match headers.get("if-match") {
        Some(rev_header) => rev_header.to_str().unwrap_or(current_rev).to_string(),
        None => current_rev.to_string(),
    };

    let mut doc = existing_doc.clone();

    let encoded = BASE64.encode(body);
    let mut attachments = doc
        .get("_attachments")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    attachments[attachment.clone()] = serde_json::json!({
        "content_type": content_type,
        "data": encoded,
    });

    doc["_attachments"] = attachments;
    doc["_rev"] = serde_json::Value::String(rev.clone());

    match state
        .databases
        .apply_document(&db, doc, Some(doc_id.clone()), true)
        .await
    {
        Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => (
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

async fn delete_attachment(
    Path((db, doc_id, attachment)): Path<(String, String, String)>,
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

    let mut doc = match state.databases.get_document(&db, &doc_id).await {
        Some(doc) => doc,
        None => return (StatusCode::NOT_FOUND, Json(not_found())),
    };

    let mut attachments = match doc.get_mut("_attachments") {
        Some(attachments) => attachments.clone(),
        None => return (StatusCode::NOT_FOUND, Json(not_found())),
    };

    if attachments.get(&attachment).is_none() {
        return (StatusCode::NOT_FOUND, Json(not_found()));
    }

    let current_rev = doc.get("_rev").and_then(|v| v.as_str()).unwrap_or("1-stub");

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

    attachments.as_object_mut().unwrap().remove(&attachment);

    let attachments_empty = attachments
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(true);

    if attachments_empty {
        if let Some(object) = doc.as_object_mut() {
            object.remove("_attachments");
        }
    } else {
        doc["_attachments"] = attachments;
    }

    doc["_rev"] = serde_json::Value::String(provided_rev.clone());

    match state
        .databases
        .apply_document(&db, doc, Some(doc_id.clone()), true)
        .await
    {
        Ok(ApplyOutcome::Stored { id, rev }) | Ok(ApplyOutcome::Deleted { id, rev }) => (
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

fn decode_view_request(encoded: &str) -> Option<(String, String, Option<String>)> {
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    let (path_part, inline_query) = match decoded.split_once('?') {
        Some((path, query)) => (path, Some(query.to_string())),
        None => (decoded.as_ref(), None),
    };
    let remainder = path_part.strip_prefix("_design/")?;
    let (design_doc, view_part) = remainder.split_once("/_view/")?;
    Some((design_doc.to_string(), view_part.to_string(), inline_query))
}

fn parse_inline_pairs(inline: Option<&str>) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let Some(query) = inline else {
        return pairs;
    };

    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }

        let mut parts = pair.splitn(2, '=');
        let raw_key = parts.next().unwrap_or("");
        let raw_value = parts.next().unwrap_or("");

        let Ok(decoded_key) = percent_decode_str(raw_key).decode_utf8() else {
            continue;
        };
        let Ok(decoded_value) = percent_decode_str(raw_value).decode_utf8() else {
            continue;
        };

        pairs.push((decoded_key.to_string(), decoded_value.to_string()));
    }

    pairs
}

fn parse_positive_usize(value: &str) -> Option<usize> {
    value.parse::<usize>().ok().filter(|parsed| *parsed > 0)
}

fn parse_json_param(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

fn compare_json_keys(left: &Value, right: &Value) -> Ordering {
    match (left, right) {
        (Value::Number(a), Value::Number(b)) => match (a.as_f64(), b.as_f64()) {
            (Some(a), Some(b)) => a.partial_cmp(&b).unwrap_or(Ordering::Equal),
            _ => Ordering::Equal,
        },
        (Value::String(a), Value::String(b)) => a.cmp(b),
        (Value::Bool(a), Value::Bool(b)) => a.cmp(b),
        _ => left.to_string().cmp(&right.to_string()),
    }
}

fn key_within_bounds(key: &Value, options: &ViewOptions) -> bool {
    if options.descending {
        if let Some(start) = options.startkey.as_ref() {
            if compare_json_keys(key, start) == Ordering::Greater {
                return false;
            }
        }

        if let Some(end) = options.endkey.as_ref() {
            if compare_json_keys(key, end) == Ordering::Less {
                return false;
            }
        }
    } else {
        if let Some(start) = options.startkey.as_ref() {
            if compare_json_keys(key, start) == Ordering::Less {
                return false;
            }
        }

        if let Some(end) = options.endkey.as_ref() {
            if compare_json_keys(key, end) == Ordering::Greater {
                return false;
            }
        }
    }

    true
}

fn key_matches_exact_filters(key: &Value, options: &ViewOptions) -> bool {
    if let Some(exact) = options.key.as_ref() {
        if compare_json_keys(key, exact) != Ordering::Equal {
            return false;
        }
    }

    if let Some(list) = options.keys.as_ref() {
        let mut found = false;
        for candidate in list {
            if compare_json_keys(key, candidate) == Ordering::Equal {
                found = true;
                break;
            }
        }

        if !found {
            return false;
        }
    }

    true
}

#[derive(serde::Deserialize)]
struct BulkDocsPayload {
    docs: Vec<serde_json::Value>,
    #[serde(default)]
    new_edits: Option<bool>,
}

#[derive(serde::Deserialize)]
struct ViewPostPayload {
    keys: Option<Vec<Value>>,
}

#[derive(Default, Deserialize)]
struct AllDocsQuery {
    include_docs: Option<bool>,
}

#[derive(Deserialize)]
struct AllDocsPostPayload {
    keys: Vec<String>,
    #[serde(default)]
    include_docs: Option<bool>,
}

#[derive(Default, Deserialize)]
struct RevisionQuery {
    rev: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    skip: Option<usize>,
    #[serde(default)]
    startkey: Option<String>,
    #[serde(default)]
    endkey: Option<String>,
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    keys: Option<String>,
    #[serde(default)]
    descending: Option<bool>,
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
