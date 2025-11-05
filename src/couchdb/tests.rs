use super::*;
use crate::couchdb_stub::TestCouchStub;
use reqwest::{Client as HttpClient, StatusCode as HttpStatus};
use serde_json::{json, Value};
use std::collections::HashMap;

#[tokio::test]
async fn test_couchdb_client_with_stub_server() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    let chunks = vec![MemvidChunk {
        id: "chunk_0".to_string(),
        content: "Memvid chunk zero".to_string(),
        start_offset: 0,
        end_offset: 18,
    }];

    let mut vectors = HashMap::new();
    vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);

    let doc_id = client
        .ingest_memvid_document(chunks, vectors, 0.75, 0.55, 3, "hash-123".to_string())
        .await
        .expect("failed to ingest document");

    let rows = client
        .query_view("memvid", "by_cognitive_load")
        .await
        .expect("failed to query view");

    assert_eq!(rows.len(), 1);
    let value = rows[0].get("value").expect("expected value object").clone();
    assert_eq!(value["id"], doc_id);
    assert_eq!(value["chunk_id"], "chunk_0");
    assert_eq!(value["content"], "Memvid chunk zero");
    assert_eq!(value["cognitive_load"], serde_json::json!(0.75));

    let http = HttpClient::new();
    let all_docs_url = format!("{}/wren3-dev/_all_docs", stub.base_url());
    let all_docs: serde_json::Value = http
        .get(&all_docs_url)
        .send()
        .await
        .expect("all_docs request failed")
        .json()
        .await
        .expect("failed to deserialize _all_docs body");

    let rows = all_docs["rows"].as_array().expect("rows array missing");
    assert!(rows.iter().any(|row| row["id"] == doc_id));

    let attachment_body = b"stub inline attachment".to_vec();
    let attachment_url = format!("{}/wren3-dev/{}/chunk_0.txt", stub.base_url(), doc_id);

    let put_response = http
        .put(&attachment_url)
        .header("Content-Type", "text/plain")
        .body(attachment_body.clone())
        .send()
        .await
        .expect("attachment upload failed");
    assert!(put_response.status().is_success());

    let get_response = http
        .get(&attachment_url)
        .send()
        .await
        .expect("attachment fetch failed");
    assert_eq!(get_response.status(), HttpStatus::OK);
    let returned = get_response
        .bytes()
        .await
        .expect("attachment bytes missing");
    assert_eq!(returned.as_ref(), attachment_body.as_slice());

    stub.shutdown().await;
}

#[tokio::test]
async fn test_missing_attachment_returns_404() {
    let stub = TestCouchStub::spawn().await;

    let http = HttpClient::new();
    let missing_url = format!("{}/wren3-dev/nonexistent/doc.txt", stub.base_url());
    let response = http
        .get(&missing_url)
        .send()
        .await
        .expect("missing attachment request failed");

    assert_eq!(response.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_conflict_on_stale_revision() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "conflict_doc", "value": 1 }))
        .send()
        .await
        .expect("create request failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let conflict_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "conflict_doc", "_rev": "0-stub", "value": 2 }))
        .send()
        .await
        .expect("conflict request failed");

    assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);
    let conflict_body: Value = conflict_resp
        .json()
        .await
        .expect("conflict body parse failed");
    assert_eq!(conflict_body["error"], "conflict");

    let valid_update = http
        .post(&db_url)
        .json(&json!({ "_id": "conflict_doc", "_rev": rev, "value": 3 }))
        .send()
        .await
        .expect("valid update failed");
    assert!(valid_update.status().is_success());

    stub.shutdown().await;
}

#[tokio::test]
async fn test_bulk_docs_deletion_removes_document() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "delete_me", "value": 42 }))
        .send()
        .await
        .expect("create for delete failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());
    let bulk_resp = http
        .post(&bulk_url)
        .json(&json!({
            "docs": [
                {
                    "_id": "delete_me",
                    "_rev": rev,
                    "_deleted": true
                }
            ]
        }))
        .send()
        .await
        .expect("bulk delete request failed");
    assert!(bulk_resp.status().is_success());
    let bulk_body: Value = bulk_resp
        .json()
        .await
        .expect("bulk delete body parse failed");
    let rows = bulk_body.as_array().expect("bulk response array");
    assert_eq!(rows.len(), 1);
    assert!(rows[0]["ok"].as_bool().unwrap_or(false));

    let get_resp = http
        .get(&format!("{}/wren3-dev/delete_me", stub.base_url()))
        .send()
        .await
        .expect("post-delete fetch failed");
    assert_eq!(get_resp.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_delete_attachment_removes_data() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "attach_doc", "value": 1 }))
        .send()
        .await
        .expect("attachment create failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let mut rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let attachment_url = format!("{}/wren3-dev/{}/file.txt", stub.base_url(), "attach_doc");
    let put_resp = http
        .put(&format!("{}?rev={}", attachment_url, rev))
        .header("Content-Type", "text/plain")
        .body("stub attachment body".as_bytes().to_vec())
        .send()
        .await
        .expect("attachment upload failed");
    assert_eq!(put_resp.status(), HttpStatus::CREATED);
    let put_body: Value = put_resp.json().await.expect("put body parse failed");
    rev = put_body["rev"]
        .as_str()
        .expect("rev missing after put")
        .to_string();

    let delete_resp = http
        .delete(&format!("{}?rev={}", attachment_url, rev))
        .send()
        .await
        .expect("attachment delete failed");
    assert_eq!(delete_resp.status(), HttpStatus::OK);
    let delete_body: Value = delete_resp.json().await.expect("delete body parse failed");
    let new_rev = delete_body["rev"]
        .as_str()
        .expect("rev missing after delete");

    let doc_resp = http
        .get(&format!("{}/wren3-dev/attach_doc", stub.base_url()))
        .send()
        .await
        .expect("doc fetch failed");
    assert_eq!(doc_resp.status(), HttpStatus::OK);
    let doc_body: Value = doc_resp.json().await.expect("doc body parse failed");
    assert!(doc_body.get("_attachments").is_none());
    assert_eq!(doc_body["_rev"], Value::String(new_rev.to_string()));

    let fetch_resp = http
        .get(&attachment_url)
        .send()
        .await
        .expect("post-delete attachment fetch failed");
    assert_eq!(fetch_resp.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_delete_attachment_with_stale_rev_conflicts() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "stale_attach", "value": 1 }))
        .send()
        .await
        .expect("stale attachment create failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let attachment_url = format!("{}/wren3-dev/{}/file.txt", stub.base_url(), "stale_attach");
    let put_resp = http
        .put(&format!("{}?rev={}", attachment_url, rev))
        .header("Content-Type", "text/plain")
        .body("body".as_bytes().to_vec())
        .send()
        .await
        .expect("attachment upload failed");
    assert_eq!(put_resp.status(), HttpStatus::CREATED);
    let put_body: Value = put_resp.json().await.expect("put body parse failed");
    let new_rev = put_body["rev"]
        .as_str()
        .expect("rev missing after put")
        .to_string();

    let conflict_resp = http
        .delete(&format!("{}?rev={}", attachment_url, rev))
        .send()
        .await
        .expect("conflict delete request failed");
    assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);
    let conflict_body: Value = conflict_resp
        .json()
        .await
        .expect("conflict body parse failed");
    assert_eq!(conflict_body["error"], "conflict");

    let success_resp = http
        .delete(&format!("{}?rev={}", attachment_url, new_rev))
        .send()
        .await
        .expect("successful delete failed");
    assert_eq!(success_resp.status(), HttpStatus::OK);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_client_delete_document_resolves_revision() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    let chunks = vec![MemvidChunk {
        id: "chunk_0".to_string(),
        content: "Document slated for deletion".to_string(),
        start_offset: 0,
        end_offset: 28,
    }];

    let mut vectors = HashMap::new();
    vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);

    let doc_id = client
        .ingest_memvid_document(chunks, vectors, 0.5, 0.5, 1, "delete-hash".to_string())
        .await
        .expect("unable to ingest document");

    let document = client
        .get_document(&doc_id)
        .await
        .expect("expected to fetch ingested document");
    assert!(document.rev.is_some());

    client
        .delete_document(&doc_id)
        .await
        .expect("delete_document helper failed");

    let http = HttpClient::new();
    let response = http
        .get(&format!("{}/wren3-dev/{}", stub.base_url(), doc_id))
        .send()
        .await
        .expect("fetch after delete failed");
    assert_eq!(response.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_changes_feed_reports_updates() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "changes_doc", "value": 1 }))
        .send()
        .await
        .expect("changes doc create failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let changes_url = format!("{}/wren3-dev/_changes", stub.base_url());
    let feed: Value = http
        .get(&format!("{}?include_docs=true", changes_url))
        .send()
        .await
        .expect("changes feed request failed")
        .json()
        .await
        .expect("changes feed parse failed");

    let results = feed["results"].as_array().expect("results array missing");
    assert!(!results.is_empty());
    assert_eq!(results[0]["id"], "changes_doc");
    assert!(results[0]["doc"].is_object());
    let last_seq = feed["last_seq"].as_u64().unwrap_or(0);

    let update_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "changes_doc", "_rev": rev, "value": 2 }))
        .send()
        .await
        .expect("changes doc update failed");
    assert!(update_resp.status().is_success());
    let update_body: Value = update_resp.json().await.expect("update body parse failed");
    let updated_rev = update_body["rev"]
        .as_str()
        .expect("rev missing after update");

    let filtered_feed: Value = http
        .get(&format!(
            "{}?since={}&include_docs=false",
            changes_url, last_seq
        ))
        .send()
        .await
        .expect("filtered changes request failed")
        .json()
        .await
        .expect("filtered changes parse failed");

    let filtered_results = filtered_feed["results"]
        .as_array()
        .expect("filtered array missing");
    assert_eq!(filtered_results.len(), 1);
    assert_eq!(filtered_results[0]["id"], "changes_doc");
    assert_eq!(
        filtered_results[0]["changes"][0]["rev"],
        Value::String(updated_rev.to_string())
    );

    stub.shutdown().await;
}

#[tokio::test]
async fn test_delete_document_requires_matching_rev() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "doc_delete", "value": 1 }))
        .send()
        .await
        .expect("doc create failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let conflict_resp = http
        .delete(&format!(
            "{}/wren3-dev/doc_delete?rev=0-stub",
            stub.base_url()
        ))
        .send()
        .await
        .expect("stale delete request failed");
    assert_eq!(conflict_resp.status(), HttpStatus::CONFLICT);

    let delete_url = format!("{}/wren3-dev/doc_delete?rev={}", stub.base_url(), rev);
    let delete_resp = http
        .delete(&delete_url)
        .send()
        .await
        .expect("doc delete request failed");
    assert_eq!(delete_resp.status(), HttpStatus::OK);
    let delete_body: Value = delete_resp.json().await.expect("delete body parse failed");
    let new_rev = delete_body["rev"]
        .as_str()
        .expect("rev missing after delete");
    assert!(delete_body["ok"].as_bool().unwrap_or(false));

    let fetch_resp = http
        .get(&format!("{}/wren3-dev/doc_delete", stub.base_url()))
        .send()
        .await
        .expect("post-delete fetch failed");
    assert_eq!(fetch_resp.status(), HttpStatus::NOT_FOUND);

    let repeat_resp = http
        .delete(&format!(
            "{}/wren3-dev/doc_delete?rev={}",
            stub.base_url(),
            new_rev
        ))
        .send()
        .await
        .expect("repeat delete request failed");
    assert_eq!(repeat_resp.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_put_document_updates_with_revision_check() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let doc_url = format!("{}/wren3-dev/doc_put", stub.base_url());

    let create_resp = http
        .put(&doc_url)
        .json(&json!({ "value": 1 }))
        .send()
        .await
        .expect("doc create via put failed");
    assert_eq!(create_resp.status(), HttpStatus::CREATED);
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing after create")
        .to_string();

    let missing_rev_resp = http
        .put(&doc_url)
        .json(&json!({ "value": 2 }))
        .send()
        .await
        .expect("missing rev update failed");
    assert_eq!(missing_rev_resp.status(), HttpStatus::CONFLICT);

    let stale_rev_resp = http
        .put(&doc_url)
        .json(&json!({ "_rev": "0-stub", "value": 3 }))
        .send()
        .await
        .expect("stale rev update failed");
    assert_eq!(stale_rev_resp.status(), HttpStatus::CONFLICT);

    let update_resp = http
        .put(&doc_url)
        .json(&json!({ "_rev": rev, "value": 4 }))
        .send()
        .await
        .expect("valid update failed");
    assert_eq!(update_resp.status(), HttpStatus::CREATED);
    let update_body: Value = update_resp.json().await.expect("update body parse failed");
    let new_rev = update_body["rev"]
        .as_str()
        .expect("rev missing after update");

    let fetch_resp = http
        .get(&doc_url)
        .send()
        .await
        .expect("fetch after update failed");
    assert_eq!(fetch_resp.status(), HttpStatus::OK);
    let fetch_body: Value = fetch_resp.json().await.expect("fetch body parse failed");
    assert_eq!(fetch_body["value"], json!(4));
    assert_eq!(fetch_body["_rev"], Value::String(new_rev.to_string()));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_bulk_docs_delete_missing_doc_returns_not_found_entry() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

    let resp = http
        .post(&bulk_url)
        .json(&json!({
            "docs": [
                {
                    "_id": "missing_doc",
                    "_rev": "1-stub",
                    "_deleted": true
                }
            ]
        }))
        .send()
        .await
        .expect("bulk delete request failed");

    assert_eq!(resp.status(), HttpStatus::CREATED);
    let body: Value = resp.json().await.expect("bulk response parse failed");
    let entries = body.as_array().expect("bulk response array missing");
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry["id"], Value::String("missing_doc".into()));
    assert_eq!(entry["error"], Value::String("not_found".into()));
    assert_eq!(entry["reason"], Value::String("missing".into()));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_bulk_docs_respects_new_edits_false_replication_semantics() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());
    let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "replicated_doc", "value": 1 }))
        .send()
        .await
        .expect("initial doc create failed");
    assert!(create_resp.status().is_success());

    let replicate_resp = http
        .post(&bulk_url)
        .json(&json!({
            "new_edits": false,
            "docs": [
                {
                    "_id": "replicated_doc",
                    "_rev": "5-remote",
                    "value": 99
                }
            ]
        }))
        .send()
        .await
        .expect("replication bulk request failed");
    assert_eq!(replicate_resp.status(), HttpStatus::CREATED);
    let replicate_body: Value = replicate_resp
        .json()
        .await
        .expect("replication response parse failed");
    let replicate_entries = replicate_body
        .as_array()
        .expect("replication response entries missing");
    assert_eq!(replicate_entries.len(), 1);
    assert_eq!(
        replicate_entries[0]["id"],
        Value::String("replicated_doc".into())
    );
    assert_eq!(
        replicate_entries[0]["rev"],
        Value::String("5-remote".into())
    );

    let fetch_resp = http
        .get(&format!("{}/wren3-dev/replicated_doc", stub.base_url()))
        .send()
        .await
        .expect("fetch replicated doc failed");
    assert_eq!(fetch_resp.status(), HttpStatus::OK);
    let fetch_body: Value = fetch_resp.json().await.expect("fetch body parse failed");
    assert_eq!(fetch_body["_rev"], Value::String("5-remote".into()));
    assert_eq!(fetch_body["value"], Value::Number(99.into()));

    let delete_replication_resp = http
        .post(&bulk_url)
        .json(&json!({
            "new_edits": false,
            "docs": [
                {
                    "_id": "replicated_doc",
                    "_rev": "6-remote",
                    "_deleted": true
                }
            ]
        }))
        .send()
        .await
        .expect("replication delete request failed");
    assert_eq!(delete_replication_resp.status(), HttpStatus::CREATED);
    let delete_entries: Value = delete_replication_resp
        .json()
        .await
        .expect("replication delete response parse failed");
    let delete_array = delete_entries
        .as_array()
        .expect("replication delete entries missing");
    assert_eq!(delete_array.len(), 1);
    assert_eq!(delete_array[0]["rev"], Value::String("6-remote".into()));

    let missing_resp = http
        .post(&bulk_url)
        .json(&json!({
            "new_edits": false,
            "docs": [
                {
                    "_id": "replicated_doc",
                    "_deleted": true
                }
            ]
        }))
        .send()
        .await
        .expect("missing rev replication request failed");
    assert_eq!(missing_resp.status(), HttpStatus::CREATED);
    let missing_body: Value = missing_resp
        .json()
        .await
        .expect("missing rev response parse failed");
    let missing_entries = missing_body
        .as_array()
        .expect("missing rev entries missing");
    assert_eq!(missing_entries.len(), 1);
    assert_eq!(
        missing_entries[0]["error"],
        Value::String("conflict".into())
    );

    let fetch_after_delete = http
        .get(&format!("{}/wren3-dev/replicated_doc", stub.base_url()))
        .send()
        .await
        .expect("fetch after replication delete failed");
    assert_eq!(fetch_after_delete.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_changes_feed_includes_tombstone_doc_when_deleted() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "tombstone_doc", "value": 1 }))
        .send()
        .await
        .expect("create tombstone doc failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev = create_body["rev"]
        .as_str()
        .expect("rev missing after create");

    let delete_resp = http
        .delete(&format!(
            "{}/wren3-dev/tombstone_doc?rev={rev}",
            stub.base_url()
        ))
        .send()
        .await
        .expect("delete tombstone doc failed");
    assert_eq!(delete_resp.status(), HttpStatus::OK);
    let delete_body: Value = delete_resp.json().await.expect("delete body parse failed");
    let delete_rev = delete_body["rev"]
        .as_str()
        .expect("rev missing after delete")
        .to_string();

    let changes_resp = http
        .get(&format!(
            "{}/wren3-dev/_changes?include_docs=true",
            stub.base_url()
        ))
        .send()
        .await
        .expect("changes request failed");
    assert_eq!(changes_resp.status(), HttpStatus::OK);
    let changes_body: Value = changes_resp
        .json()
        .await
        .expect("changes body parse failed");
    let results = changes_body["results"]
        .as_array()
        .expect("changes results missing");

    let tombstone_entry = results
        .iter()
        .rev()
        .find(|entry| entry["id"] == "tombstone_doc")
        .expect("tombstone entry missing in changes feed");
    assert_eq!(tombstone_entry["deleted"], Value::Bool(true));
    let doc = tombstone_entry["doc"]
        .as_object()
        .expect("tombstone doc missing");
    assert_eq!(doc.get("_id"), Some(&Value::String("tombstone_doc".into())));
    assert_eq!(doc.get("_rev"), Some(&Value::String(delete_rev.clone())));
    assert_eq!(doc.get("_deleted"), Some(&Value::Bool(true)));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_bulk_docs_new_edits_false_requires_explicit_id() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let bulk_url = format!("{}/wren3-dev/_bulk_docs", stub.base_url());

    let resp = http
        .post(&bulk_url)
        .json(&json!({
            "new_edits": false,
            "docs": [
                {
                    "_rev": "1-remote",
                    "value": 42
                }
            ]
        }))
        .send()
        .await
        .expect("bulk request without id failed");

    assert_eq!(resp.status(), HttpStatus::CREATED);
    let body: Value = resp.json().await.expect("bulk missing id parse failed");
    let entries = body.as_array().expect("bulk missing id entries missing");
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry["error"], Value::String("bad_request".into()));
    assert_eq!(
        entry["reason"],
        Value::String("Document id required for replication".into())
    );

    stub.shutdown().await;
}

#[tokio::test]
async fn test_get_document_with_revision_query_returns_historical_version() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());

    let create_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "rev_doc", "value": 1 }))
        .send()
        .await
        .expect("revision doc create failed");
    assert!(create_resp.status().is_success());
    let create_body: Value = create_resp.json().await.expect("create body parse failed");
    let rev1 = create_body["rev"]
        .as_str()
        .expect("rev missing")
        .to_string();

    let update_resp = http
        .post(&db_url)
        .json(&json!({ "_id": "rev_doc", "_rev": rev1, "value": 2 }))
        .send()
        .await
        .expect("revision doc update failed");
    assert!(update_resp.status().is_success());
    let update_body: Value = update_resp.json().await.expect("update body parse failed");
    let rev2 = update_body["rev"]
        .as_str()
        .expect("rev missing after update")
        .to_string();

    let latest_resp = http
        .get(&format!("{}/wren3-dev/rev_doc", stub.base_url()))
        .send()
        .await
        .expect("latest fetch failed");
    assert_eq!(latest_resp.status(), HttpStatus::OK);
    let latest_body: Value = latest_resp.json().await.expect("latest body parse failed");
    assert_eq!(latest_body["value"], Value::Number(2.into()));
    assert_eq!(latest_body["_rev"], Value::String(rev2.clone()));

    let latest_rev_resp = http
        .get(&format!(
            "{}/wren3-dev/rev_doc?rev={}",
            stub.base_url(),
            rev2
        ))
        .send()
        .await
        .expect("latest rev fetch failed");
    assert_eq!(latest_rev_resp.status(), HttpStatus::OK);
    let latest_rev_body: Value = latest_rev_resp
        .json()
        .await
        .expect("latest rev body parse failed");
    assert_eq!(latest_rev_body["value"], Value::Number(2.into()));

    let historical_resp = http
        .get(&format!(
            "{}/wren3-dev/rev_doc?rev={}",
            stub.base_url(),
            rev1
        ))
        .send()
        .await
        .expect("historical fetch failed");
    assert_eq!(historical_resp.status(), HttpStatus::OK);
    let historical_body: Value = historical_resp
        .json()
        .await
        .expect("historical body parse failed");
    assert_eq!(historical_body["value"], Value::Number(1.into()));
    assert_eq!(historical_body["_rev"], Value::String(rev1));

    let missing_rev_resp = http
        .get(&format!(
            "{}/wren3-dev/rev_doc?rev=999-missing",
            stub.base_url()
        ))
        .send()
        .await
        .expect("missing rev request failed");
    assert_eq!(missing_rev_resp.status(), HttpStatus::NOT_FOUND);

    stub.shutdown().await;
}

#[tokio::test]
async fn test_post_all_docs_filters_by_keys_and_includes_missing() {
    let stub = TestCouchStub::spawn().await;
    let http = HttpClient::new();
    let db_url = format!("{}/wren3-dev", stub.base_url());
    let all_docs_url = format!("{}/wren3-dev/_all_docs?include_docs=true", stub.base_url());

    let create_a = http
        .post(&db_url)
        .json(&json!({ "_id": "doc_a", "value": 1 }))
        .send()
        .await
        .expect("doc a create failed");
    assert!(create_a.status().is_success());

    let create_b = http
        .post(&db_url)
        .json(&json!({ "_id": "doc_b", "value": 2 }))
        .send()
        .await
        .expect("doc b create failed");
    assert!(create_b.status().is_success());

    let resp = http
        .post(&all_docs_url)
        .json(&json!({ "keys": ["doc_a", "missing_doc"] }))
        .send()
        .await
        .expect("post _all_docs request failed");

    assert_eq!(resp.status(), HttpStatus::OK);
    let body: Value = resp.json().await.expect("post _all_docs body parse failed");
    assert_eq!(body["total_rows"], Value::Number(2.into()));
    let rows = body["rows"].as_array().expect("rows array missing");
    assert_eq!(rows.len(), 2);

    let first = &rows[0];
    assert_eq!(first["key"], Value::String("doc_a".into()));
    assert_eq!(first["id"], Value::String("doc_a".into()));
    assert!(first["doc"].is_object());

    let second = &rows[1];
    assert_eq!(second["key"], Value::String("missing_doc".into()));
    assert_eq!(second["error"], Value::String("not_found".into()));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_handles_space_in_values() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
        .create_view(
            "memvid",
            "by_cognitive_load",
            r#"
            function(doc) {
                if (doc.vectors) {
                    emit(doc.cognitive_load, doc);
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let mut params = HashMap::new();
    params.insert("startkey", serde_json::json!("chunk 0"));

    let rows = client
        .query_view_with_params("memvid", "by_cognitive_load", params)
        .await
        .expect("query with spaced value should succeed");

    assert!(rows.is_empty());

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_respects_limit() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let chunks = vec![
        MemvidChunk {
            id: "chunk_0".to_string(),
            content: "first".to_string(),
            start_offset: 0,
            end_offset: 5,
        },
        MemvidChunk {
            id: "chunk_1".to_string(),
            content: "second".to_string(),
            start_offset: 6,
            end_offset: 12,
        },
    ];

    let mut vectors = HashMap::new();
    vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);
    vectors.insert("chunk_1".to_string(), vec![0.4, 0.5, 0.6]);

    client
        .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash".to_string())
        .await
        .expect("failed to ingest document");

    let mut params = HashMap::new();
    params.insert("limit", serde_json::json!(1));

    let rows = client
        .query_view_with_params("memvid", "by_cognitive_load", params)
        .await
        .expect("view query should succeed");

    assert_eq!(rows.len(), 1, "view query should honor limit parameter");

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_respects_skip() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let chunks = vec![
        MemvidChunk {
            id: "chunk_0".to_string(),
            content: "first".to_string(),
            start_offset: 0,
            end_offset: 5,
        },
        MemvidChunk {
            id: "chunk_1".to_string(),
            content: "second".to_string(),
            start_offset: 6,
            end_offset: 12,
        },
    ];

    let mut vectors = HashMap::new();
    vectors.insert("chunk_0".to_string(), vec![0.1, 0.2, 0.3]);
    vectors.insert("chunk_1".to_string(), vec![0.4, 0.5, 0.6]);

    client
        .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash".to_string())
        .await
        .expect("failed to ingest document");

    let mut params = HashMap::new();
    params.insert("skip", serde_json::json!(1));

    let rows = client
        .query_view_with_params("memvid", "by_cognitive_load", params)
        .await
        .expect("view query should succeed");

    assert_eq!(rows.len(), 1, "view query should honor skip parameter");

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_respects_startkey_endkey() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let low_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "low-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_low".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.2, 0.2, 1, "hash-low".to_string())
            .await
            .expect("failed to ingest low document")
    };

    let mid_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_mid".to_string(),
            content: "mid-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_mid".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash-mid".to_string())
            .await
            .expect("failed to ingest mid document")
    };

    let _high_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: "high-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_high".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.8, 0.2, 1, "hash-high".to_string())
            .await
            .expect("failed to ingest high document")
    };

    let mut params = HashMap::new();
    params.insert("startkey", serde_json::json!(0.4));
    params.insert("endkey", serde_json::json!(0.7));

    let rows = client
        .query_view_with_params("memvid", "by_cognitive_load", params)
        .await
        .expect("view query should succeed");

    assert_eq!(rows.len(), 1, "view query should honor startkey and endkey range");
    let value = rows[0].get("value").expect("value missing");
    assert_eq!(value["id"], serde_json::json!(mid_id));
    assert_ne!(value["id"], serde_json::json!(low_id));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_respects_key() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let low_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "low-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_low".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.2, 0.2, 1, "hash-low".to_string())
            .await
            .expect("failed to ingest low document")
    };

    let mid_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_mid".to_string(),
            content: "mid-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_mid".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash-mid".to_string())
            .await
            .expect("failed to ingest mid document")
    };

    let _high_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: "high-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_high".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.8, 0.2, 1, "hash-high".to_string())
            .await
            .expect("failed to ingest high document")
    };

    let mut params = HashMap::new();
    params.insert("key", serde_json::json!(0.5));

    let rows = client
        .query_view_with_params("memvid", "by_cognitive_load", params)
        .await
        .expect("view query should succeed");

    assert_eq!(rows.len(), 1, "view query should honor key parameter");
    let value = rows[0].get("value").expect("value missing");
    assert_eq!(value["id"], serde_json::json!(mid_id));
    assert_ne!(value["id"], serde_json::json!(low_id));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_respects_keys_via_post() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let low_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "low-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_low".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.2, 0.2, 1, "hash-low".to_string())
            .await
            .expect("failed to ingest low document")
    };

    let mid_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_mid".to_string(),
            content: "mid-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_mid".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash-mid".to_string())
            .await
            .expect("failed to ingest mid document")
    };

    let high_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: "high-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_high".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.8, 0.2, 1, "hash-high".to_string())
            .await
            .expect("failed to ingest high document")
    };

    let http = HttpClient::new();
    let view_url = format!("{}/wren3-dev/_design/memvid/_view/by_cognitive_load", stub.base_url());
    let response = http
        .post(&view_url)
        .json(&serde_json::json!({
            "keys": [0.2, 0.8]
        }))
        .send()
        .await
        .expect("POST view request failed");

    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body: Value = response.json().await.expect("view response parse failed");
    let rows = body["rows"].as_array().expect("rows array missing");
    assert_eq!(rows.len(), 2, "view query should honor keys parameter");

    let ids: std::collections::HashSet<_> = rows
        .iter()
        .filter_map(|row| row["value"]["id"].as_str())
        .collect();
    assert!(ids.contains(&low_id.as_str()));
    assert!(ids.contains(&high_id.as_str()));
    assert!(!ids.contains(&mid_id.as_str()));

    stub.shutdown().await;
}

#[tokio::test]
async fn test_query_view_with_params_post_respects_query_params() {
    let stub = TestCouchStub::spawn().await;

    let client = CouchDBClient::new(&stub.base_url(), "wren3-dev")
        .await
        .expect("failed to create couch client");

    client
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
                            content: doc.content || ""
                        });
                    }
                }
            }
        "#,
        )
        .await
        .expect("failed to create view");

    let low_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_low".to_string(),
            content: "low-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_low".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.2, 0.2, 1, "hash-low".to_string())
            .await
            .expect("failed to ingest low document")
    };

    let mid_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_mid".to_string(),
            content: "mid-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_mid".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.5, 0.2, 1, "hash-mid".to_string())
            .await
            .expect("failed to ingest mid document")
    };

    let _high_id = {
        let chunks = vec![MemvidChunk {
            id: "chunk_high".to_string(),
            content: "high-content".to_string(),
            start_offset: 0,
            end_offset: 10,
        }];

        let mut vectors = HashMap::new();
        vectors.insert("chunk_high".to_string(), vec![0.1, 0.2, 0.3]);

        client
            .ingest_memvid_document(chunks, vectors, 0.8, 0.2, 1, "hash-high".to_string())
            .await
            .expect("failed to ingest high document")
    };

    let http = HttpClient::new();
    let view_url = format!(
        "{}/wren3-dev/_design/memvid/_view/by_cognitive_load?startkey=0.2&endkey=0.8&skip=1&limit=1",
        stub.base_url()
    );
    let response = http
        .post(&view_url)
        .json(&serde_json::json!({}))
        .send()
        .await
        .expect("POST view request failed");

    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body: Value = response.json().await.expect("view response parse failed");
    let rows = body["rows"].as_array().expect("rows array missing");
    assert_eq!(rows.len(), 1, "view query should honor query params on POST");

    let value = rows[0]
        .get("value")
        .expect("value missing on row");
    assert_eq!(value["id"], serde_json::json!(mid_id));
    assert_ne!(value["id"], serde_json::json!(low_id));

    stub.shutdown().await;
}
