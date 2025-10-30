#![allow(dead_code)]

use crate::error_handling::{Result, Wren3Error};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalLLMRequest {
    pub prompt: String,
    pub n_predict: Option<usize>,
    pub temperature: Option<f64>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub repeat_penalty: Option<f64>,
    pub repeat_last_n: Option<usize>,
    pub seed: Option<i64>,
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalLLMResponse {
    pub content: String,
    pub generation_settings: Option<LocalLLMGenerationSettings>,
    pub model: Option<String>,
    pub prompt: Option<String>,
    pub stopped_eos: Option<bool>,
    pub stopped_limit: Option<bool>,
    pub stopped_word: Option<bool>,
    pub stopping_word: Option<String>,
    pub timings: Option<LocalLLMTimings>,
    pub tokens_cached: Option<usize>,
    pub tokens_evaluated: Option<usize>,
    pub tokens_predicted: Option<usize>,
    pub truncated: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalLLMGenerationSettings {
    pub frequency_penalty: Option<f64>,
    pub grammar: Option<String>,
    pub ignore_eos: Option<bool>,
    pub logit_bias: Option<HashMap<String, f64>>,
    pub min_p: Option<f64>,
    pub mirostat: Option<usize>,
    pub mirostat_eta: Option<f64>,
    pub mirostat_tau: Option<f64>,
    pub model: Option<String>,
    pub n_ctx: Option<usize>,
    pub n_keep: Option<usize>,
    pub n_predict: Option<usize>,
    pub n_probs: Option<usize>,
    pub penalize_nl: Option<bool>,
    pub presence_penalty: Option<f64>,
    pub repeat_last_n: Option<usize>,
    pub repeat_penalty: Option<f64>,
    pub seed: Option<i64>,
    pub stop: Option<Vec<String>>,
    pub stream: Option<bool>,
    pub temperature: Option<f64>,
    pub tfs_z: Option<f64>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub typical_p: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalLLMTimings {
    pub predicted_ms: Option<f64>,
    pub predicted_n: Option<usize>,
    pub predicted_per_second: Option<f64>,
    pub predicted_per_token_ms: Option<f64>,
    pub prompt_ms: Option<f64>,
    pub prompt_n: Option<usize>,
    pub prompt_per_second: Option<f64>,
    pub prompt_per_token_ms: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalLLMHealthResponse {
    pub status: String,
    pub slots_idle: Option<usize>,
    pub slots_processing: Option<usize>,
}

#[derive(Debug)]
pub struct LocalLLMClient {
    client: Client,
    endpoint: String,
    model_name: String,
    context_length: usize,
    temperature: f64,
}

impl LocalLLMClient {
    pub fn new(
        endpoint: String,
        model_name: String,
        context_length: usize,
        temperature: f64,
    ) -> Self {
        Self {
            client: Client::new(),
            endpoint: endpoint.trim_end_matches('/').to_string(),
            model_name,
            context_length,
            temperature,
        }
    }

    pub async fn health_check(&self) -> Result<LocalLLMHealthResponse> {
        let url = format!("{}/health", self.endpoint);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(Wren3Error::Network)?;

        if !response.status().is_success() {
            return Err(Wren3Error::Network(
                response.error_for_status().unwrap_err(),
            ));
        }

        let health: LocalLLMHealthResponse = response.json().await.map_err(Wren3Error::Network)?;

        Ok(health)
    }

    pub async fn completion(
        &self,
        prompt: &str,
        options: LocalLLMOptions,
    ) -> Result<LocalLLMResponse> {
        let url = format!("{}/completion", self.endpoint);

        let request = LocalLLMRequest {
            prompt: prompt.to_string(),
            n_predict: options.max_tokens,
            temperature: Some(options.temperature.unwrap_or(self.temperature)),
            top_k: options.top_k,
            top_p: options.top_p,
            repeat_penalty: options.repeat_penalty,
            repeat_last_n: options.repeat_last_n,
            seed: options.seed,
            stream: Some(false),
        };

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(Wren3Error::Network)?;

        if !response.status().is_success() {
            let error_text = response.text().await.map_err(Wren3Error::Network)?;
            return Err(Wren3Error::OpenAI(format!(
                "Local LLM API error: {}",
                error_text
            )));
        }

        let completion: LocalLLMResponse = response.json().await.map_err(Wren3Error::Network)?;

        Ok(completion)
    }

    pub async fn completion_simple(
        &self,
        prompt: &str,
        max_tokens: Option<usize>,
    ) -> Result<String> {
        let options = LocalLLMOptions {
            max_tokens,
            temperature: Some(self.temperature),
            top_k: None,
            top_p: None,
            repeat_penalty: None,
            repeat_last_n: None,
            seed: None,
        };

        let response = self.completion(prompt, options).await?;
        Ok(response.content)
    }

    pub async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: LocalLLMOptions,
    ) -> Result<String> {
        // Convert chat messages to a single prompt
        let prompt = self.format_chat_messages(messages);
        self.completion_simple(&prompt, options.max_tokens).await
    }

    fn format_chat_messages(&self, messages: Vec<ChatMessage>) -> String {
        let mut prompt = String::new();

        for message in messages {
            match message.role.as_str() {
                "system" => {
                    prompt.push_str(&format!("System: {}\n\n", message.content));
                }
                "user" => {
                    prompt.push_str(&format!("User: {}\n\n", message.content));
                }
                "assistant" => {
                    prompt.push_str(&format!("Assistant: {}\n\n", message.content));
                }
                _ => {
                    prompt.push_str(&format!("{}: {}\n\n", message.role, message.content));
                }
            }
        }

        prompt.push_str("Assistant: ");
        prompt
    }

    pub fn get_model_name(&self) -> &str {
        &self.model_name
    }

    pub fn get_context_length(&self) -> usize {
        self.context_length
    }
}

#[derive(Debug, Clone)]
pub struct LocalLLMOptions {
    pub max_tokens: Option<usize>,
    pub temperature: Option<f64>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub repeat_penalty: Option<f64>,
    pub repeat_last_n: Option<usize>,
    pub seed: Option<i64>,
}

impl Default for LocalLLMOptions {
    fn default() -> Self {
        Self {
            max_tokens: Some(256),
            temperature: Some(0.8),
            top_k: Some(40),
            top_p: Some(0.9),
            repeat_penalty: Some(1.1),
            repeat_last_n: Some(64),
            seed: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: &str) -> Self {
        Self {
            role: "system".to_string(),
            content: content.to_string(),
        }
    }

    pub fn user(content: &str) -> Self {
        Self {
            role: "user".to_string(),
            content: content.to_string(),
        }
    }

    pub fn assistant(content: &str) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.to_string(),
        }
    }
}

#[derive(Debug)]
pub struct LLMProvider {
    openai_client: Option<crate::openai::OpenAIClient>,
    local_client: Option<LocalLLMClient>,
}

impl LLMProvider {
    pub fn new(
        openai_api_key: Option<String>,
        local_config: Option<crate::config::LocalLLMConfig>,
    ) -> Self {
        let openai_client = openai_api_key.map(crate::openai::OpenAIClient::new);
        let local_client = local_config.map(|config| {
            LocalLLMClient::new(
                config.endpoint,
                config.model_name,
                config.context_length,
                config.temperature,
            )
        });

        Self {
            openai_client,
            local_client,
        }
    }

    pub async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
        max_tokens: Option<u32>,
        temperature: Option<f64>,
    ) -> Result<String> {
        if let Some(openai) = &self.openai_client {
            // Convert ChatMessage to OpenAIMessage
            let openai_messages: Vec<crate::openai::OpenAIMessage> = messages
                .into_iter()
                .map(|msg| crate::openai::OpenAIMessage {
                    role: msg.role,
                    content: msg.content,
                })
                .collect();

            return Ok(openai
                .chat_completion_simple(model, openai_messages, max_tokens, temperature)
                .await?);
        }

        if let Some(local) = &self.local_client {
            let options = LocalLLMOptions {
                max_tokens: max_tokens.map(|t| t as usize),
                temperature,
                ..Default::default()
            };

            return local.chat_completion(messages, options).await;
        }

        Err(Wren3Error::Config("No LLM provider configured".to_string()))
    }

    pub async fn embed_text(&self, text: &str, model: &str) -> Result<Vec<f64>> {
        if let Some(openai) = &self.openai_client {
            return Ok(openai.embed_text(text, model).await?);
        }

        // For local models, we don't have embedding support yet
        // This would need to be implemented with a local embedding model
        Err(Wren3Error::Config(
            "Local embedding not supported yet".to_string(),
        ))
    }

    pub async fn health_check(&self) -> Result<()> {
        if let Some(openai) = &self.openai_client {
            // For OpenAI, we can try a simple models list call
            let _ = openai.list_models().await?;
            return Ok(());
        }

        if let Some(local) = &self.local_client {
            let health = local.health_check().await?;
            if health.status != "ok" {
                return Err(Wren3Error::OpenAI(format!(
                    "Local LLM health check failed: {}",
                    health.status
                )));
            }
            return Ok(());
        }

        Err(Wren3Error::Config("No LLM provider configured".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;
    use serde_json::json;

    fn network_tests_enabled() -> bool {
        std::env::var("WREN3_ENABLE_NETWORK_TESTS")
            .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true"))
            .unwrap_or(false)
    }

    fn skip_network_test(test_name: &str) -> bool {
        if network_tests_enabled() {
            false
        } else {
            eprintln!("Skipping {}: network tests disabled", test_name);
            true
        }
    }

    fn create_test_client(server_url: &str) -> LocalLLMClient {
        LocalLLMClient::new(server_url.to_string(), "test-model".to_string(), 2048, 0.8)
    }

    fn create_test_provider_with_local(server_url: &str) -> LLMProvider {
        let local_config = crate::config::LocalLLMConfig {
            endpoint: server_url.to_string(),
            model_name: "test-model".to_string(),
            context_length: 2048,
            temperature: 0.8,
        };
        LLMProvider::new(None, Some(local_config))
    }

    #[allow(dead_code)]
    fn create_test_provider_with_openai() -> LLMProvider {
        LLMProvider::new(Some("test-key".to_string()), None)
    }

    #[tokio::test]
    async fn test_local_llm_client_creation() {
        let client = LocalLLMClient::new(
            "http://localhost:8080".to_string(),
            "llama-2-7b".to_string(),
            4096,
            0.7,
        );

        assert_eq!(client.endpoint, "http://localhost:8080");
        assert_eq!(client.model_name, "llama-2-7b");
        assert_eq!(client.context_length, 4096);
        assert_eq!(client.temperature, 0.7);
    }

    #[tokio::test]
    async fn test_local_llm_client_endpoint_trimming() {
        let client = LocalLLMClient::new(
            "http://localhost:8080/".to_string(),
            "test-model".to_string(),
            2048,
            0.8,
        );

        assert_eq!(client.endpoint, "http://localhost:8080");
    }

    #[tokio::test]
    async fn test_chat_message_constructors() {
        let system_msg = ChatMessage::system("You are a helpful assistant");
        assert_eq!(system_msg.role, "system");
        assert_eq!(system_msg.content, "You are a helpful assistant");

        let user_msg = ChatMessage::user("Hello!");
        assert_eq!(user_msg.role, "user");
        assert_eq!(user_msg.content, "Hello!");

        let assistant_msg = ChatMessage::assistant("Hi there!");
        assert_eq!(assistant_msg.role, "assistant");
        assert_eq!(assistant_msg.content, "Hi there!");
    }

    #[tokio::test]
    async fn test_format_chat_messages() {
        let client = create_test_client("http://test.com");
        let messages = vec![
            ChatMessage::system("You are a helpful assistant"),
            ChatMessage::user("Hello!"),
            ChatMessage::assistant("Hi there!"),
        ];

        let formatted = client.format_chat_messages(messages);
        let expected = "System: You are a helpful assistant\n\nUser: Hello!\n\nAssistant: Hi there!\n\nAssistant: ";
        assert_eq!(formatted, expected);
    }

    #[tokio::test]
    async fn test_local_llm_options_default() {
        let options = LocalLLMOptions::default();
        assert_eq!(options.max_tokens, Some(256));
        assert_eq!(options.temperature, Some(0.8));
        assert_eq!(options.top_k, Some(40));
        assert_eq!(options.top_p, Some(0.9));
        assert_eq!(options.repeat_penalty, Some(1.1));
        assert_eq!(options.repeat_last_n, Some(64));
        assert_eq!(options.seed, None);
    }

    #[tokio::test]
    async fn test_health_check_success() {
        if skip_network_test("test_health_check_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/health")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "status": "ok",
                    "slots_idle": 2,
                    "slots_processing": 0
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let health = client.health_check().await.unwrap();

        assert_eq!(health.status, "ok");
        assert_eq!(health.slots_idle, Some(2));
        assert_eq!(health.slots_processing, Some(0));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_health_check_api_error() {
        if skip_network_test("test_health_check_api_error") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/health")
            .with_status(503)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "error": "Service unavailable"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let result = client.health_check().await;

        assert!(result.is_err());
        // Should be a Network error due to non-success status

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_completion_success() {
        if skip_network_test("test_completion_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/completion")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "content": "This is a test response from the local LLM.",
                    "model": "test-model",
                    "stopped_eos": true,
                    "tokens_predicted": 10,
                    "tokens_evaluated": 5,
                    "timings": {
                        "predicted_ms": 150.5,
                        "predicted_n": 10
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let options = LocalLLMOptions {
            max_tokens: Some(100),
            temperature: Some(0.7),
            top_k: Some(50),
            top_p: Some(0.95),
            repeat_penalty: Some(1.2),
            repeat_last_n: Some(128),
            seed: Some(42),
        };

        let response = client.completion("Test prompt", options).await.unwrap();

        assert_eq!(
            response.content,
            "This is a test response from the local LLM."
        );
        assert_eq!(response.model, Some("test-model".to_string()));
        assert_eq!(response.stopped_eos, Some(true));
        assert_eq!(response.tokens_predicted, Some(10));
        assert_eq!(response.tokens_evaluated, Some(5));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_completion_api_error() {
        if skip_network_test("test_completion_api_error") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/completion")
            .with_status(400)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "error": "Invalid request parameters"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let options = LocalLLMOptions::default();

        let result = client.completion("Test prompt", options).await;

        assert!(result.is_err());
        if let Err(Wren3Error::OpenAI(msg)) = result {
            assert!(msg.contains("Local LLM API error"));
        } else {
            panic!("Expected OpenAI error");
        }

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_completion_simple_success() {
        if skip_network_test("test_completion_simple_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/completion")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "content": "Simple response",
                    "model": "test-model"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let response = client
            .completion_simple("Test prompt", Some(50))
            .await
            .unwrap();

        assert_eq!(response, "Simple response");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_chat_completion_success() {
        if skip_network_test("test_chat_completion_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/completion")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "content": "Chat response",
                    "model": "test-model"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let messages = vec![ChatMessage::user("Hello!")];
        let options = LocalLLMOptions {
            max_tokens: Some(100),
            temperature: Some(0.8),
            ..Default::default()
        };

        let response = client.chat_completion(messages, options).await.unwrap();

        assert_eq!(response, "Chat response");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_get_model_name_and_context_length() {
        let client = LocalLLMClient::new(
            "http://test.com".to_string(),
            "llama-2-13b".to_string(),
            4096,
            0.7,
        );

        assert_eq!(client.get_model_name(), "llama-2-13b");
        assert_eq!(client.get_context_length(), 4096);
    }

    #[tokio::test]
    async fn test_llm_provider_new_with_local() {
        let local_config = crate::config::LocalLLMConfig {
            endpoint: "http://localhost:8080".to_string(),
            model_name: "test-model".to_string(),
            context_length: 2048,
            temperature: 0.8,
        };

        let provider = LLMProvider::new(None, Some(local_config));

        assert!(provider.openai_client.is_none());
        assert!(provider.local_client.is_some());
    }

    #[tokio::test]
    async fn test_llm_provider_new_with_openai() {
        let provider = LLMProvider::new(Some("test-key".to_string()), None);

        assert!(provider.openai_client.is_some());
        assert!(provider.local_client.is_none());
    }

    #[tokio::test]
    async fn test_llm_provider_chat_completion_local() {
        if skip_network_test("test_llm_provider_chat_completion_local") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/completion")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "content": "Local response",
                    "model": "test-model"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let provider = create_test_provider_with_local(&server.url());
        let messages = vec![ChatMessage::user("Hello!")];

        let response = provider
            .chat_completion(messages, "test-model", Some(100), Some(0.8))
            .await
            .unwrap();

        assert_eq!(response, "Local response");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_llm_provider_health_check_local_success() {
        if skip_network_test("test_llm_provider_health_check_local_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/health")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "status": "ok",
                    "slots_idle": 1,
                    "slots_processing": 0
                })
                .to_string(),
            )
            .create_async()
            .await;

        let provider = create_test_provider_with_local(&server.url());
        let result = provider.health_check().await;

        assert!(result.is_ok());

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_llm_provider_health_check_local_unhealthy() {
        if skip_network_test("test_llm_provider_health_check_local_unhealthy") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/health")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "status": "error",
                    "slots_idle": 0,
                    "slots_processing": 0
                })
                .to_string(),
            )
            .create_async()
            .await;

        let provider = create_test_provider_with_local(&server.url());
        let result = provider.health_check().await;

        assert!(result.is_err());
        if let Err(Wren3Error::OpenAI(msg)) = result {
            assert!(msg.contains("health check failed"));
        } else {
            panic!("Expected OpenAI error");
        }

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_llm_provider_no_provider_configured() {
        let provider = LLMProvider::new(None, None);
        let messages = vec![ChatMessage::user("Hello!")];

        let result = provider
            .chat_completion(messages, "test-model", None, None)
            .await;

        assert!(result.is_err());
        if let Err(Wren3Error::Config(msg)) = result {
            assert!(msg.contains("No LLM provider configured"));
        } else {
            panic!("Expected Config error");
        }
    }

    #[tokio::test]
    async fn test_llm_provider_embed_text_local_not_supported() {
        let provider = create_test_provider_with_local("http://test.com");

        let result = provider.embed_text("test text", "test-model").await;

        assert!(result.is_err());
        if let Err(Wren3Error::Config(msg)) = result {
            assert!(msg.contains("Local embedding not supported"));
        } else {
            panic!("Expected Config error");
        }
    }

    #[tokio::test]
    async fn test_llm_provider_health_check_no_provider() {
        let provider = LLMProvider::new(None, None);

        let result = provider.health_check().await;

        assert!(result.is_err());
        if let Err(Wren3Error::Config(msg)) = result {
            assert!(msg.contains("No LLM provider configured"));
        } else {
            panic!("Expected Config error");
        }
    }
}
