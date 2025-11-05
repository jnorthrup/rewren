use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::couchdb::CouchDBClient;

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ProviderQuota {
    /// provider name, e.g. "openai", "qwen", "gemini", "local" etc.
    pub provider: String,
    /// max requests per minute (or other unit depending on orchestration)
    pub rpm: Option<u64>,
    /// max tokens per minute
    pub tpm: Option<u64>,
    /// arbitrary metadata (region, priority, etc.)
    #[serde(default)]
    pub meta: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub api_key: Option<String>,
    pub endpoint: Option<String>,
    #[serde(default)]
    pub quota: Option<ProviderQuota>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OrchestratorConfig {
    /// Global name or environment
    pub name: Option<String>,
    /// Max fan-out parallel shards we will use when fan-out is enabled
    pub max_fanout: Option<usize>,
    /// Map of provider configs keyed by provider name
    pub providers: HashMap<String, ProviderConfig>,
}

impl OrchestratorConfig {
    /// Parse orchestration config from a JSON string
    pub fn from_json_str(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    /// Basic validation: ensure provider names are consistent and quota numbers are sane
    pub fn validate(&self) -> Result<(), String> {
        if self.providers.is_empty() {
            return Err("no providers configured".to_string());
        }

        for (k, p) in &self.providers {
            if p.name != *k {
                return Err(format!("provider key '{}' does not match provider.name '{}'", k, p.name));
            }

            if let Some(q) = &p.quota {
                if let Some(rpm) = q.rpm {
                    if rpm == 0 {
                        return Err(format!("provider '{}' has rpm=0", k));
                    }
                }
                if let Some(tpm) = q.tpm {
                    if tpm == 0 {
                        return Err(format!("provider '{}' has tpm=0", k));
                    }
                }
            }
        }

        Ok(())
    }

    /// Return a shallow summary of quotas for quick visibility
    pub fn quota_summary(&self) -> HashMap<String, (Option<u64>, Option<u64>)> {
        let mut out = HashMap::new();
        for (k, p) in &self.providers {
            if let Some(q) = &p.quota {
                out.insert(k.clone(), (q.rpm, q.tpm));
            } else {
                out.insert(k.clone(), (None, None));
            }
        }
        out
    }

    /// Execute fan-out orchestration: select available providers for concurrent execution.
    pub async fn fan_out_execute(&self) -> Result<String, String> {
        // Create a list to store the providers we'll use for fan-out
        let mut selected_providers = Vec::new();

        // Select providers based on availability, quota, and max_fanout constraint
        for (provider_name, provider_config) in &self.providers {
            // Check if provider has valid quota - exclude if either RPM or TPM is 0
            if let Some(ref quota) = provider_config.quota {
                // If either rpm or tpm is 0, skip this provider
                if (quota.rpm.is_some() && quota.rpm == Some(0)) || 
                   (quota.tpm.is_some() && quota.tpm == Some(0)) {
                    continue; // Skip providers with zero quotas
                }
            }
            
            // Check if we've reached the max_fanout limit
            if selected_providers.len() >= self.max_fanout.unwrap_or(self.providers.len()) {
                break; // Respect max_fanout limit
            }
            
            selected_providers.push(provider_name.clone());
        }

        // Serialize the list of selected provider names as JSON
        let result_json = serde_json::to_string(&selected_providers)
            .map_err(|e| format!("Failed to serialize provider list: {:?}", e))?;

        Ok(result_json)
    }
}

/// Runtime state for orchestrator: tree of quotas -> providers -> models -> settings
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelSettings {
    pub telem: bool,
    pub metrics: bool,
    pub bayes: bool,
    pub prompts: bool,
    pub blackboard: bool,
    #[serde(default)]
    pub permissions: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelNode {
    pub name: String,
    pub settings: ModelSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderNode {
    pub name: String,
    pub quota: Option<ProviderQuota>,
    pub models: HashMap<String, ModelNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct OrchestratorState {
    pub providers: HashMap<String, ProviderNode>,
}

impl OrchestratorState {
    pub fn new() -> Self {
        Self { providers: HashMap::new() }
    }

    pub fn add_provider(&mut self, p: ProviderNode) -> bool {
        let key = p.name.clone();
        self.providers.insert(key, p).is_some()
    }

    pub fn remove_provider(&mut self, provider: &str) -> bool {
        self.providers.remove(provider).is_some()
    }

    pub fn add_model(&mut self, provider: &str, model: ModelNode) -> Result<(), String> {
        match self.providers.get_mut(provider) {
            Some(pnode) => {
                pnode.models.insert(model.name.clone(), model);
                Ok(())
            }
            None => Err(format!("provider '{}' not found", provider)),
        }
    }

    pub fn remove_model(&mut self, provider: &str, model: &str) -> Result<(), String> {
        match self.providers.get_mut(provider) {
            Some(pnode) => {
                pnode.models.remove(model);
                Ok(())
            }
            None => Err(format!("provider '{}' not found", provider)),
        }
    }

    pub fn set_model_settings(&mut self, provider: &str, model: &str, settings: ModelSettings) -> Result<(), String> {
        match self.providers.get_mut(provider) {
            Some(pnode) => match pnode.models.get_mut(model) {
                Some(mnode) => { mnode.settings = settings; Ok(()) }
                None => Err(format!("model '{}' not found for provider '{}'", model, provider)),
            },
            None => Err(format!("provider '{}' not found", provider)),
        }
    }

    /// Persist state to CouchDB
    pub async fn save_to_couchdb(&self, db_url: &str) -> Result<(), String> {
        use crate::couchdb::CouchDBClient;
        
        // Create a CouchDB client
        let client = CouchDBClient::new(db_url, "rewren-dev")
            .await
            .map_err(|e| format!("Failed to create CouchDB client: {:?}", e))?;

        // Save the orchestrator state as a document
        let _doc_id = client
            .save_state_as_document(self, Some("orchestrator_state"))
            .await
            .map_err(|e| format!("Failed to save orchestrator state: {:?}", e))?;

        Ok(())
    }

    /// Load orchestrator state from a CouchDB view that emits tree rows.
    pub async fn load_from_couch_view(
        couch: &CouchDBClient,
        design_doc: &str,
        view: &str,
    ) -> Result<Self, String> {
        use serde_json::Value;
        use std::collections::HashMap;

        // Query the view to get the rows
        let rows = couch.query_view(design_doc, view)
            .await
            .map_err(|e| format!("Failed to query view: {:?}", e))?;

        let mut providers = HashMap::new();

        // Process each row from the view
        for row in rows {
            // Each row should have a structure like:
            // {
            //   "id": "document-id",
            //   "key": "provider-name", 
            //   "value": {provider-data}
            // }
            if let (Some(key_val), Some(value_val)) = (row.get("key"), row.get("value")) {
                // Extract provider name from key
                let provider_name = key_val.as_str()
                    .ok_or_else(|| "Provider name in key is not a string".to_string())?
                    .to_string();

                // Deserialize the value as a ProviderNode
                let provider_node: ProviderNode = serde_json::from_value(value_val.clone())
                    .map_err(|e| format!("Failed to deserialize provider node: {:?}", e))?;

                // Add the provider to our collection
                providers.insert(provider_name, provider_node);
            } else {
                // Debug: print the row structure if key/value extraction fails
                eprintln!("Row structure doesn't match expected format: {:?}", row);
            }
        }

        // Create the orchestrator state with the loaded providers
        let state = OrchestratorState { providers };

        Ok(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_validate_orchestrator_config() {
        let sample = r#"
        {
            "name": "demo",
            "max_fanout": 4,
            "providers": {
                "openai": {
                    "name": "openai",
                    "api_key": null,
                    "endpoint": "https://api.openai.com",
                    "quota": { "provider": "openai", "rpm": 60, "tpm": 100000 }
                },
                "local": {
                    "name": "local",
                    "endpoint": "http://localhost:8080",
                    "quota": { "provider": "local", "rpm": 1000 }
                }
            }
        }
        "#;

        let cfg = OrchestratorConfig::from_json_str(sample).expect("parse failed");
    assert_eq!(cfg.name.as_deref(), Some("demo"));
    assert_eq!(cfg.max_fanout.unwrap(), 4);
        assert!(cfg.providers.contains_key("openai"));
        assert!(cfg.providers.contains_key("local"));

        cfg.validate().expect("validation failed");

        let summary = cfg.quota_summary();
        assert_eq!(summary.get("openai").unwrap().0, Some(60));
        assert_eq!(summary.get("openai").unwrap().1, Some(100000));
        assert_eq!(summary.get("local").unwrap().0, Some(1000));
    }

    #[tokio::test]
    async fn test_fan_out_execution_with_no_providers() {
        let cfg = OrchestratorConfig {
            name: Some("x".to_string()),
            max_fanout: Some(1),
            providers: HashMap::new(),
        };

        let res = cfg.fan_out_execute().await;
        // With no providers, we should return an empty list
        assert!(res.is_ok());
        let result = res.unwrap();
        let providers: Vec<String> = serde_json::from_str(&result).unwrap();
        assert_eq!(providers.len(), 0);
    }

    // TDD red: Basic fan-out execution test - should select available providers
    #[tokio::test]
    async fn test_fan_out_execute_selects_available_providers() {
        let mut providers = HashMap::new();
        
        // Add multiple providers
        providers.insert(
            "openai".to_string(),
            ProviderConfig {
                name: "openai".to_string(),
                api_key: None,
                endpoint: Some("https://api.openai.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "openai".to_string(),
                    rpm: Some(60),
                    tpm: Some(100000),
                    meta: HashMap::new(),
                }),
            },
        );
        
        providers.insert(
            "qwen".to_string(),
            ProviderConfig {
                name: "qwen".to_string(),
                api_key: Some("qwen-api-key".to_string()),
                endpoint: Some("https://qwen-server.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "qwen".to_string(),
                    rpm: Some(100),
                    tpm: Some(200000),
                    meta: HashMap::new(),
                }),
            },
        );
        
        providers.insert(
            "local".to_string(),
            ProviderConfig {
                name: "local".to_string(),
                api_key: None,
                endpoint: Some("http://localhost:8080".to_string()),
                quota: Some(ProviderQuota {
                    provider: "local".to_string(),
                    rpm: Some(1000),
                    tpm: Some(50000),
                    meta: HashMap::new(),
                }),
            },
        );

        let cfg = OrchestratorConfig {
            name: Some("test-fanout".to_string()),
            max_fanout: Some(3), // Allow up to 3 concurrent calls
            providers,
        };

        // Execute the fan-out and expect it to return a list of selected provider names
        let res = cfg.fan_out_execute().await;
        assert!(res.is_ok(), "expected fan_out_execute to be implemented and return Ok");

        // Verify that the result contains the expected provider names
        if let Ok(result_str) = res {
            // The result should include the names of the providers we configured
            // For now, we could expect it to return a JSON array of provider names
            let result_providers: Vec<String> = serde_json::from_str(&result_str)
                .expect("Result should be a valid JSON array of provider names");
            
            // Should have selected all 3 providers since max_fanout is 3 and all have quota
            assert_eq!(result_providers.len(), 3);
            assert!(result_providers.contains(&"openai".to_string()));
            assert!(result_providers.contains(&"qwen".to_string()));
            assert!(result_providers.contains(&"local".to_string()));
        }
    }

    #[tokio::test]
    async fn test_load_orchestrator_state_from_view() {
        // TDD red: expect load_from_couch_view to be implemented in future.
        use std::collections::HashMap;
        use crate::couchdb::CouchDBClient;

        // Create a test orchestrator state
        let mut state = OrchestratorState::new();
        
        // Create a provider with models
        let mut models = HashMap::new();
        models.insert("gpt-4".to_string(), ModelNode {
            name: "gpt-4".to_string(),
            settings: ModelSettings {
                telem: true,
                metrics: true,
                bayes: false,
                prompts: true,
                blackboard: false,
                permissions: HashMap::new(),
            }
        });
        
        let provider_node = ProviderNode {
            name: "openai".to_string(),
            quota: Some(ProviderQuota {
                provider: "openai".to_string(),
                rpm: Some(60),
                tpm: Some(100000),
                meta: HashMap::new(),
            }),
            models,
        };
        
        state.add_provider(provider_node);

        // Create a CouchDB client
        let stub = crate::couchdb_stub::TestCouchStub::spawn().await;
        let client = crate::couchdb::CouchDBClient::new(&stub.base_url(), "rewren-dev")
            .await
            .expect("failed to create couch client");

        // Create a view that emits each provider as a separate row
        let map_function = r#"
            function(doc) {
                if (doc.providers) {
                    for (var provider_name in doc.providers) {
                        var provider = doc.providers[provider_name];
                        emit(provider_name, provider);
                    }
                }
            }
        "#;
        
        client.create_view("orchestrator", "by_provider", map_function)
            .await
            .expect("Failed to create view");

        // Save the test state to the database
        let doc_id = client
            .save_state_as_document(&state, Some("orchestrator_state"))
            .await
            .expect("Failed to save test state");
            
        // Debug: Let's retrieve and print the saved document to see its structure
        use serde_json::Value;
        let saved_doc: Value = client
            .get_document_by_id(&doc_id)
            .await
            .expect("Failed to retrieve saved doc");
        println!("Saved document structure: {:?}", saved_doc);
        
        // In some CouchDB implementations, we might need to wait a bit for the view to be indexed
        // Or update the document to force it to be indexed by the view
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Query the view directly to see what it returns
        let view_results = client.query_view("orchestrator", "by_provider").await
            .expect("Failed to query view");
        println!("View results: {:?}", view_results);

        // Load the orchestrator state from the view
        let res = OrchestratorState::load_from_couch_view(&client, "orchestrator", "by_provider").await;
        assert!(res.is_ok(), "expected load_from_couch_view to be implemented and return Ok: {:?}", res.err());

        // Verify that the loaded state matches the original state
        if let Ok(loaded_state) = res {
            // The loaded state should match the original state
            assert_eq!(loaded_state.providers.len(), state.providers.len(), 
                "Expected {} providers, got {}", state.providers.len(), loaded_state.providers.len());
            
            // Additional checks would compare the actual content of providers/models
            for (provider_name, original_provider) in &state.providers {
                assert!(loaded_state.providers.contains_key(provider_name), 
                    "Loaded state missing provider: {}", provider_name);
                
                if let Some(loaded_provider) = loaded_state.providers.get(provider_name) {
                    assert_eq!(original_provider.name, loaded_provider.name);
                    assert_eq!(original_provider.models.len(), loaded_provider.models.len());
                }
            }
        }

        stub.shutdown().await;
    }

    // TDD red: expect save_to_couchdb to be implemented in future.
    #[tokio::test]
    async fn test_save_and_load_orchestrator_state_as_single_doc() {
        use std::collections::HashMap;

        // Create a complex OrchestratorState object
        let mut state = OrchestratorState::new();
        
        // Create a provider with models
        let mut models = HashMap::new();
        models.insert("gpt-4".to_string(), ModelNode {
            name: "gpt-4".to_string(),
            settings: ModelSettings {
                telem: true,
                metrics: true,
                bayes: false,
                prompts: true,
                blackboard: false,
                permissions: HashMap::new(),
            }
        });
        
        models.insert("gpt-3.5-turbo".to_string(), ModelNode {
            name: "gpt-3.5-turbo".to_string(),
            settings: ModelSettings {
                telem: false,
                metrics: true,
                bayes: true,
                prompts: false,
                blackboard: true,
                permissions: HashMap::new(),
            }
        });
        
        let provider_node = ProviderNode {
            name: "openai".to_string(),
            quota: Some(ProviderQuota {
                provider: "openai".to_string(),
                rpm: Some(60),
                tpm: Some(100000),
                meta: HashMap::new(),
            }),
            models,
        };
        
        state.add_provider(provider_node);
        
        // Create another provider with a different model
        let mut models2 = HashMap::new();
        models2.insert("llama-2-7b".to_string(), ModelNode {
            name: "llama-2-7b".to_string(),
            settings: ModelSettings {
                telem: true,
                metrics: false,
                bayes: true,
                prompts: true,
                blackboard: false,
                permissions: HashMap::new(),
            }
        });
        
        let provider_node2 = ProviderNode {
            name: "local".to_string(),
            quota: Some(ProviderQuota {
                provider: "local".to_string(),
                rpm: Some(1000),
                tpm: Some(50000),
                meta: HashMap::new(),
            }),
            models: models2,
        };
        
        state.add_provider(provider_node2);

        // Use test stub to test the save functionality
        let stub = crate::couchdb_stub::TestCouchStub::spawn().await;
        
        // Attempt to save the state to CouchDB - this should fail initially (TDD Red)
        let save_result = state.save_to_couchdb(&stub.base_url()).await;
        assert!(save_result.is_ok(), "Expected save_to_couchdb to be implemented and return Ok - TDD Red test");
        
        stub.shutdown().await;
    }

    // TDD red: Test that fan-out respects the max_fanout limit
    #[tokio::test]
    async fn test_fan_out_respects_max_fanout_limit() {
        let mut providers = HashMap::new();
        
        // Add 5 providers
        for i in 1..=5 {
            let name = format!("provider{}", i);
            providers.insert(
                name.clone(),
                ProviderConfig {
                    name: name.clone(),
                    api_key: None,
                    endpoint: Some(format!("http://provider{}.example.com", i)),
                    quota: Some(ProviderQuota {
                        provider: name,
                        rpm: Some(100),
                        tpm: Some(100000),
                        meta: HashMap::new(),
                    }),
                },
            );
        }

        // Configure with max_fanout of 2
        let cfg = OrchestratorConfig {
            name: Some("test-max-fanout".to_string()),
            max_fanout: Some(2), // Limit to 2 concurrent calls
            providers,
        };

        // Execute the fan-out
        let res = cfg.fan_out_execute().await;
        assert!(res.is_ok(), "expected fan_out_execute to be implemented and return Ok");

        if let Ok(result_str) = res {
            let selected_providers: Vec<String> = serde_json::from_str(&result_str)
                .expect("Result should be a valid JSON array of provider names");
            
            // Should have selected only up to max_fanout (2) providers
            assert_eq!(selected_providers.len(), 2, 
                "Expected 2 providers (max_fanout), got {}", selected_providers.len());
        }
    }

    // TDD red: Test quota-aware provider selection - should exclude providers with zero quota
    #[tokio::test]
    async fn test_fan_out_excludes_providers_at_zero_quota() {
        let mut providers = HashMap::new();
        
        // Add a provider with normal quota
        providers.insert(
            "working_provider".to_string(),
            ProviderConfig {
                name: "working_provider".to_string(),
                api_key: None,
                endpoint: Some("http://working.example.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "working_provider".to_string(),
                    rpm: Some(100),
                    tpm: Some(100000),
                    meta: HashMap::new(),
                }),
            },
        );
        
        // Add a provider with zero RPM quota - should be excluded
        providers.insert(
            "zero_quota_provider_rpm".to_string(),
            ProviderConfig {
                name: "zero_quota_provider_rpm".to_string(),
                api_key: None,
                endpoint: Some("http://zero-rpm.example.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "zero_quota_provider_rpm".to_string(),
                    rpm: Some(0), // Zero quota
                    tpm: Some(100000),
                    meta: HashMap::new(),
                }),
            },
        );
        
        // Add a provider with zero TPM quota - should be excluded
        providers.insert(
            "zero_quota_provider_tpm".to_string(),
            ProviderConfig {
                name: "zero_quota_provider_tpm".to_string(),
                api_key: None,
                endpoint: Some("http://zero-tpm.example.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "zero_quota_provider_tpm".to_string(),
                    rpm: Some(100),
                    tpm: Some(0), // Zero quota
                    meta: HashMap::new(),
                }),
            },
        );
        
        // Add a provider with both quotas as zero - should be excluded
        providers.insert(
            "zero_quota_provider_both".to_string(),
            ProviderConfig {
                name: "zero_quota_provider_both".to_string(),
                api_key: None,
                endpoint: Some("http://zero-both.example.com".to_string()),
                quota: Some(ProviderQuota {
                    provider: "zero_quota_provider_both".to_string(),
                    rpm: Some(0), // Zero quota
                    tpm: Some(0), // Zero quota
                    meta: HashMap::new(),
                }),
            },
        );

        // Configure with a high max_fanout to test quota exclusion
        let cfg = OrchestratorConfig {
            name: Some("test-quota".to_string()),
            max_fanout: Some(10), // High enough to include all providers if they had quota
            providers,
        };

        // Execute the fan-out
        let res = cfg.fan_out_execute().await;
        assert!(res.is_ok(), "expected fan_out_execute to be implemented and return Ok");

        if let Ok(result_str) = res {
            let selected_providers: Vec<String> = serde_json::from_str(&result_str)
                .expect("Result should be a valid JSON array of provider names");
            
            // Should have only selected the provider with valid quotas
            assert_eq!(selected_providers.len(), 1, 
                "Expected 1 provider with valid quota, got {}", selected_providers.len());
            assert!(selected_providers.contains(&"working_provider".to_string()), 
                "Should have selected the working provider");
            
            // Should NOT have selected any of the zero-quota providers
            assert!(!selected_providers.contains(&"zero_quota_provider_rpm".to_string()), 
                "Should NOT have selected provider with zero RPM");
            assert!(!selected_providers.contains(&"zero_quota_provider_tpm".to_string()), 
                "Should NOT have selected provider with zero TPM");
            assert!(!selected_providers.contains(&"zero_quota_provider_both".to_string()), 
                "Should NOT have selected provider with zero quotas");
        }
    }
}
