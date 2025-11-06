use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// Represents a document in our memvid store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "_rev")]
    pub rev: String,
    #[serde(flatten)]
    pub fields: HashMap<String, serde_json::Value>,
    #[serde(skip)]
    pub attachments: Option<HashMap<String, Attachment>>,
}

/// Represents an attachment to a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub content_type: String,
    pub data: Vec<u8>,
    pub length: usize,
    pub revpos: u32,
}

/// Represents a design document for views
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignDocument {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "_rev")]
    pub rev: String,
    pub views: HashMap<String, View>,
    pub language: Option<String>,
}

/// Represents a view function in a design document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct View {
    pub map: String,
    pub reduce: Option<String>,
}

/// Represents a database in our memvid store with VFS mapping
#[derive(Debug, Clone)]
pub struct Database {
    pub name: String,
    pub base_path: PathBuf,
    pub documents: Arc<DashMap<String, Document>>,
}

/// The persistent MemVidStore with efficient VFS mapping
#[derive(Debug, Clone)]
pub struct MemVidStore {
    pub databases: Arc<DashMap<String, Database>>,
    pub base_path: PathBuf,
}

impl MemVidStore {
    pub fn new(base_path: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        std::fs::create_dir_all(&base_path)?;
        Ok(Self {
            databases: Arc::new(DashMap::new()),
            base_path,
        })
    }

    /// Create a new database
    pub async fn create_database(&self, name: &str) -> Result<(), String> {
        // Check if database exists in VFS
        let db_path = self.base_path.join(name);
        if tokio::fs::metadata(&db_path).await.is_ok() {
            return Err("Database already exists".to_string());
        }

        tokio::fs::create_dir_all(&db_path)
            .await
            .map_err(|e| format!("Failed to create database directory: {}", e))?;

        self.databases.insert(
            name.to_string(),
            Database {
                name: name.to_string(),
                base_path: db_path,
                documents: Arc::new(DashMap::new()),
            },
        );

        Ok(())
    }

    /// Get a database by name, loading from VFS if not in memory
    pub fn get_database(&self, name: &str) -> Option<Database> {
        if let Some(db) = self.databases.get(name) {
            Some(db.clone())
        } else {
            // Check if database exists in VFS and load it
            let db_path = self.base_path.join(name);
            if db_path.exists() {
                // Add to memory cache
                let db = Database {
                    name: name.to_string(),
                    base_path: db_path,
                    documents: Arc::new(DashMap::new()),
                };
                self.databases.insert(name.to_string(), db.clone());
                Some(db)
            } else {
                None
            }
        }
    }

    /// Delete a database
    pub async fn delete_database(&self, name: &str) -> Result<(), String> {
        if self.databases.remove(name).is_some() {
            let db_path = self.base_path.join(name);
            tokio::fs::remove_dir_all(&db_path)
                .await
                .map_err(|e| format!("Failed to remove database directory: {}", e))?;
            Ok(())
        } else {
            Err("Database not found".to_string())
        }
    }
}

impl Database {
    /// Insert or update a document with VFS persistence
    pub async fn put_document(&self, mut doc: Document) -> Result<Document, String> {
        // Generate a new revision if this is an update or if _rev is not provided
        doc.rev = format!("{}-{}", 
            Uuid::new_v4().to_string().split('-').next().unwrap_or("1"), 
            doc.rev
        );
        
        // Save document to VFS
        let doc_path = self.base_path.join(format!("{}.json", doc.id));
        let doc_content = serde_json::to_string(&doc)
            .map_err(|e| format!("Failed to serialize document: {}", e))?;
        
        tokio::fs::write(&doc_path, doc_content)
            .await
            .map_err(|e| format!("Failed to write document to VFS: {}", e))?;

        // Update in-memory cache
        self.documents.insert(doc.id.clone(), doc.clone());
        
        Ok(doc)
    }

    /// Get a document by ID, loading from VFS if not in memory
    pub async fn get_document(&self, id: &str) -> Result<Option<Document>, String> {
        // Check in-memory cache first
        if let Some(doc) = self.documents.get(id) {
            return Ok(Some(doc.clone()));
        }

        // Load from VFS
        let doc_path = self.base_path.join(format!("{}.json", id));
        match tokio::fs::read_to_string(&doc_path).await {
            Ok(content) => {
                let doc: Document = serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to deserialize document: {}", e))?;
                
                // Cache in memory for future access
                self.documents.insert(doc.id.clone(), doc.clone());
                
                Ok(Some(doc))
            }
            Err(_) => Ok(None), // Document doesn't exist
        }
    }

    /// Delete a document with revision check
    pub async fn delete_document(&self, id: &str, rev: &str) -> Result<(), String> {
        if let Some(current_doc) = self.documents.get(id) {
            if current_doc.rev != rev {
                return Err("Document revision mismatch".to_string());
            }
            
            // Remove from in-memory cache
            self.documents.remove(id);
            
            // Remove from VFS
            let doc_path = self.base_path.join(format!("{}.json", id));
            tokio::fs::remove_file(&doc_path)
                .await
                .map_err(|e| format!("Failed to remove document from VFS: {}", e))?;
                
            Ok(())
        } else {
            // Check VFS for the document
            let doc_path = self.base_path.join(format!("{}.json", id));
            match tokio::fs::read_to_string(&doc_path).await {
                Ok(content) => {
                    let doc: Document = serde_json::from_str(&content)
                        .map_err(|e| format!("Failed to deserialize document: {}", e))?;
                    
                    if doc.rev != rev {
                        return Err("Document revision mismatch".to_string());
                    }
                    
                    // Remove from VFS
                    tokio::fs::remove_file(&doc_path)
                        .await
                        .map_err(|e| format!("Failed to remove document from VFS: {}", e))?;
                    
                    Ok(())
                }
                Err(_) => Err("Document not found".to_string()),
            }
        }
    }

    /// Put a design document with VFS persistence
    pub async fn put_design_document(&self, mut ddoc: DesignDocument) -> Result<DesignDocument, String> {
        // Generate a new revision for the design document
        ddoc.rev = format!("{}-{}", 
            Uuid::new_v4().to_string().split('-').next().unwrap_or("1"), 
            ddoc.rev
        );
        
        // Save design document to VFS
        let doc_path = self.base_path.join(format!("{}.json", ddoc.id));
        let doc_content = serde_json::to_string(&ddoc)
            .map_err(|e| format!("Failed to serialize design document: {}", e))?;
        
        tokio::fs::write(&doc_path, doc_content)
            .await
            .map_err(|e| format!("Failed to write design document to VFS: {}", e))?;

        // Update in-memory cache by treating it as a regular document
        let mut fields: HashMap<String, serde_json::Value> = HashMap::new();
        fields.insert("views".to_string(), serde_json::to_value(&ddoc.views).unwrap());
        if let Some(lang) = &ddoc.language {
            fields.insert("language".to_string(), serde_json::Value::String(lang.clone()));
        }

        let doc = Document {
            id: ddoc.id.clone(),
            rev: ddoc.rev.clone(),
            fields,
            attachments: None,
        };
        
        self.documents.insert(ddoc.id.clone(), doc);

        Ok(ddoc)
    }

    /// Get a design document by ID, loading from VFS if not in memory
    pub async fn get_design_document(&self, id: &str) -> Result<Option<DesignDocument>, String> {
        match self.get_document(id).await? {
            Some(doc) => {
                // Convert the stored document back to a DesignDocument
                let views: HashMap<String, View> = doc.fields.get("views")
                    .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                    .unwrap_or_default();
                    
                let language = doc.fields.get("language")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let ddoc = DesignDocument {
                    id: doc.id,
                    rev: doc.rev,
                    views,
                    language,
                };
                
                Ok(Some(ddoc))
            }
            None => Ok(None),
        }
    }
}