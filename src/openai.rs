#![allow(dead_code)]

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChatRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
    pub usage: OpenAIUsage,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChoice {
    pub index: u32,
    pub message: OpenAIMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIModel {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIModelsResponse {
    pub object: String,
    pub data: Vec<OpenAIModel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HarmonyRequest {
    pub model: String,
    pub input: Vec<String>,
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub stream: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum HarmonyChunk {
    #[serde(rename = "response.reasoning_text.delta")]
    ReasoningDelta { delta: String },
    #[serde(rename = "response.output_text.delta")]
    OutputDelta { delta: String },
    #[serde(rename = "response.done")]
    Done,
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Default)]
pub struct HarmonyResponse {
    pub reasoning: String,
    pub output: String,
}

#[derive(Debug, Clone)]
pub struct OpenAIClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAIClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url: "https://api.openai.com/v1".to_string(),
        }
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url;
        self
    }

    pub async fn list_models(&self) -> Result<Vec<OpenAIModel>> {
        let url = format!("{}/models", self.base_url);
        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("OpenAI API error: {}", error_text));
        }

        let models_response: OpenAIModelsResponse = response.json().await?;
        Ok(models_response.data)
    }

    pub async fn chat_completion(&self, request: OpenAIChatRequest) -> Result<OpenAIChatResponse> {
        let url = format!("{}/chat/completions", self.base_url);
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("OpenAI API error: {}", error_text));
        }

        let chat_response: OpenAIChatResponse = response.json().await?;
        Ok(chat_response)
    }

    pub async fn chat_completion_simple(
        &self,
        model: &str,
        messages: Vec<OpenAIMessage>,
        max_tokens: Option<u32>,
        temperature: Option<f64>,
    ) -> Result<String> {
        let request = OpenAIChatRequest {
            model: model.to_string(),
            messages,
            max_tokens,
            temperature,
            stream: Some(false),
        };

        let response = self.chat_completion(request).await?;
        if let Some(choice) = response.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err(anyhow::anyhow!("No response choices returned"))
        }
    }

    pub async fn harmony_completion(
        &self,
        model: &str,
        input: Vec<String>,
        max_tokens: Option<u32>,
    ) -> Result<HarmonyResponse> {
        let url = format!("{}/responses", self.base_url);

        let request = HarmonyRequest {
            model: model.to_string(),
            input,
            max_output_tokens: max_tokens,
            temperature: Some(1.0),
            top_p: Some(1.0),
            stream: Some(true),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Harmony API error: {}", error_text));
        }

        let mut result = HarmonyResponse::default();
        let text = response.text().await?;

        for line in text.lines() {
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let json_str = &line[6..]; // Skip "data: "
            if json_str == "[DONE]" {
                break;
            }

            if let Ok(chunk) = serde_json::from_str::<HarmonyChunk>(json_str) {
                match chunk {
                    HarmonyChunk::ReasoningDelta { delta } => {
                        result.reasoning.push_str(&delta);
                    }
                    HarmonyChunk::OutputDelta { delta } => {
                        result.output.push_str(&delta);
                    }
                    HarmonyChunk::Done => break,
                    HarmonyChunk::Other => {}
                }
            }
        }

        Ok(result)
    }

    pub async fn embed_text(&self, text: &str, model: &str) -> Result<Vec<f64>> {
        let url = format!("{}/embeddings", self.base_url);

        #[derive(Serialize)]
        struct EmbeddingRequest {
            model: String,
            input: String,
        }

        let request = EmbeddingRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("OpenAI API error: {}", error_text));
        }

        #[derive(Deserialize)]
        struct EmbeddingResponse {
            data: Vec<EmbeddingData>,
        }

        #[derive(Deserialize)]
        struct EmbeddingData {
            embedding: Vec<f64>,
        }

        let embedding_response: EmbeddingResponse = response.json().await?;
        if let Some(data) = embedding_response.data.first() {
            Ok(data.embedding.clone())
        } else {
            Err(anyhow::anyhow!("No embedding data returned"))
        }
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

    fn create_test_client(server_url: &str) -> OpenAIClient {
        OpenAIClient {
            client: Client::new(),
            api_key: "test-key".to_string(),
            base_url: server_url.to_string(),
        }
    }

    #[tokio::test]
    async fn test_openai_client_creation() {
        let client = OpenAIClient::new("test-api-key".to_string());
        assert_eq!(client.api_key, "test-api-key");
        assert_eq!(client.base_url, "https://api.openai.com/v1");
    }

    #[tokio::test]
    async fn test_openai_client_with_custom_base_url() {
        let client = OpenAIClient::new("test-api-key".to_string())
            .with_base_url("https://custom.openai.com/v1".to_string());
        assert_eq!(client.base_url, "https://custom.openai.com/v1");
    }

    #[tokio::test]
    async fn test_list_models_success() {
        if skip_network_test("test_list_models_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/models")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "object": "list",
                    "data": [
                        {
                            "id": "gpt-3.5-turbo",
                            "object": "model",
                            "created": 1677610602,
                            "owned_by": "openai"
                        },
                        {
                            "id": "gpt-4",
                            "object": "model",
                            "created": 1687882411,
                            "owned_by": "openai"
                        }
                    ]
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let models = client.list_models().await.unwrap();

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-3.5-turbo");
        assert_eq!(models[1].id, "gpt-4");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_models_api_error() {
        if skip_network_test("test_list_models_api_error") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("GET", "/models")
            .with_status(401)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "error": {
                        "message": "Invalid API key",
                        "type": "invalid_request_error"
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let result = client.list_models().await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("OpenAI API error"));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_chat_completion_success() {
        if skip_network_test("test_chat_completion_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "id": "chatcmpl-123",
                    "object": "chat.completion",
                    "created": 1677652288,
                    "model": "gpt-3.5-turbo",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "Hello! How can I help you today?"
                            },
                            "finish_reason": "stop"
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 9,
                        "completion_tokens": 12,
                        "total_tokens": 21
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let request = OpenAIChatRequest {
            model: "gpt-3.5-turbo".to_string(),
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: "Hello!".to_string(),
            }],
            max_tokens: Some(100),
            temperature: Some(0.7),
            stream: Some(false),
        };

        let response = client.chat_completion(request).await.unwrap();

        assert_eq!(response.id, "chatcmpl-123");
        assert_eq!(response.model, "gpt-3.5-turbo");
        assert_eq!(response.choices.len(), 1);
        assert_eq!(
            response.choices[0].message.content,
            "Hello! How can I help you today?"
        );
        assert_eq!(response.usage.total_tokens, 21);

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_chat_completion_simple_success() {
        if skip_network_test("test_chat_completion_simple_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "id": "chatcmpl-123",
                    "object": "chat.completion",
                    "created": 1677652288,
                    "model": "gpt-3.5-turbo",
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "This is a test response."
                            },
                            "finish_reason": "stop"
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 5,
                        "completion_tokens": 5,
                        "total_tokens": 10
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let messages = vec![OpenAIMessage {
            role: "user".to_string(),
            content: "Test message".to_string(),
        }];

        let response = client
            .chat_completion_simple("gpt-3.5-turbo", messages, Some(50), Some(0.5))
            .await
            .unwrap();

        assert_eq!(response, "This is a test response.");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_chat_completion_simple_no_choices() {
        if skip_network_test("test_chat_completion_simple_no_choices") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "id": "chatcmpl-123",
                    "object": "chat.completion",
                    "created": 1677652288,
                    "model": "gpt-3.5-turbo",
                    "choices": [],
                    "usage": {
                        "prompt_tokens": 5,
                        "completion_tokens": 0,
                        "total_tokens": 5
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let messages = vec![OpenAIMessage {
            role: "user".to_string(),
            content: "Test message".to_string(),
        }];

        let result = client
            .chat_completion_simple("gpt-3.5-turbo", messages, None, None)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("No response choices returned"));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_embed_text_success() {
        if skip_network_test("test_embed_text_success") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/embeddings")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "object": "list",
                    "data": [
                        {
                            "object": "embedding",
                            "embedding": [0.1, 0.2, 0.3, 0.4, 0.5],
                            "index": 0
                        }
                    ],
                    "model": "text-embedding-ada-002",
                    "usage": {
                        "prompt_tokens": 8,
                        "total_tokens": 8
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let embedding = client
            .embed_text("Hello world", "text-embedding-ada-002")
            .await
            .unwrap();

        assert_eq!(embedding.len(), 5);
        assert_eq!(embedding, vec![0.1, 0.2, 0.3, 0.4, 0.5]);

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_embed_text_no_data() {
        if skip_network_test("test_embed_text_no_data") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/embeddings")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "object": "list",
                    "data": [],
                    "model": "text-embedding-ada-002",
                    "usage": {
                        "prompt_tokens": 8,
                        "total_tokens": 8
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let result = client
            .embed_text("Hello world", "text-embedding-ada-002")
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("No embedding data returned"));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_chat_completion_api_error() {
        if skip_network_test("test_chat_completion_api_error") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(429)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "error": {
                        "message": "Rate limit exceeded",
                        "type": "rate_limit_error"
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let request = OpenAIChatRequest {
            model: "gpt-3.5-turbo".to_string(),
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: "Hello!".to_string(),
            }],
            max_tokens: None,
            temperature: None,
            stream: None,
        };

        let result = client.chat_completion(request).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("OpenAI API error"));

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_embed_text_api_error() {
        if skip_network_test("test_embed_text_api_error") {
            return;
        }
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/embeddings")
            .with_status(400)
            .with_header("content-type", "application/json")
            .with_body(
                json!({
                    "error": {
                        "message": "Invalid model",
                        "type": "invalid_request_error"
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let client = create_test_client(&server.url());
        let result = client.embed_text("Hello world", "invalid-model").await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("OpenAI API error"));

        mock.assert_async().await;
    }
}
