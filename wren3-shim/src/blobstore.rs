use std::path::PathBuf;
use tokio::fs;
use anyhow::Result;

/// BlobStore handles storing and retrieving binary attachments for documents
#[derive(Debug, Clone)]
pub struct BlobStore {
    base_path: PathBuf,
}

impl BlobStore {
    pub fn new(base_path: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&base_path)?;
        Ok(Self { base_path })
    }

    /// Store an attachment for a document
    pub async fn put_attachment(
        &self,
        db_name: &str,
        doc_id: &str,
        attachment_name: &str,
        data: Vec<u8>,
    ) -> Result<()> {
        let attachment_path = self.get_attachment_path(db_name, doc_id, attachment_name);
        
        // Create directory if it doesn't exist
        if let Some(parent) = attachment_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        // Write the attachment data to the file
        fs::write(&attachment_path, data).await?;
        
        Ok(())
    }

    /// Retrieve an attachment for a document
    pub async fn get_attachment(
        &self,
        db_name: &str,
        doc_id: &str,
        attachment_name: &str,
    ) -> Result<Vec<u8>> {
        let attachment_path = self.get_attachment_path(db_name, doc_id, attachment_name);
        let data = fs::read(&attachment_path).await?;
        Ok(data)
    }

    /// Delete an attachment for a document
    pub async fn delete_attachment(
        &self,
        db_name: &str,
        doc_id: &str,
        attachment_name: &str,
    ) -> Result<()> {
        let attachment_path = self.get_attachment_path(db_name, doc_id, attachment_name);
        fs::remove_file(&attachment_path).await?;
        Ok(())
    }

    /// Helper to get the file path for an attachment
    fn get_attachment_path(&self, db_name: &str, doc_id: &str, attachment_name: &str) -> PathBuf {
        self.base_path
            .join(db_name)
            .join(doc_id)
            .join(attachment_name)
    }
}