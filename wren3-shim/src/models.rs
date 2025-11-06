use serde::{Deserialize, Serialize};

/// Response structure for CouchDB-compatible responses
#[derive(Debug, Serialize, Deserialize)]
pub struct CouchDbResponse {
    pub ok: bool,
    #[serde(rename = "id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "rev", skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
}