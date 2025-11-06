use crate::error_handling::{Result, Wren3Error};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub database: DatabaseConfig,
    pub openai: Option<OpenAIConfig>,
    pub local_llm: Option<LocalLLMConfig>,
    pub providers: HashMap<String, ProviderConfig>,
    pub tui: TuiConfig,
    pub qa: QAConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub name: String,
    pub api_key: String,
    pub base_url: String,
    pub default_model: String,
    pub max_tokens: u32,
    pub temperature: f64,
    pub use_harmony: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub name: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub default_model: String,
    pub embedding_model: String,
    pub max_tokens: u32,
    pub temperature: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalLLMConfig {
    pub endpoint: String,
    pub model_name: String,
    pub context_length: usize,
    pub temperature: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuiConfig {
    pub enable_mouse: bool,
    pub theme: String,
    pub keybindings: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QAConfig {
    pub enabled: bool,
    pub screenshot_dir: String,
    pub auto_screenshot: bool,
    pub test_timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub file: Option<String>,
    pub max_file_size_mb: usize,
    pub max_files: usize,
}

impl Default for Config {
    // Clarity: these defaults are intended for local development and safe-by-default behavior.
    // - The OpenAI `api_key` is intentionally an empty string so OpenAI features stay disabled
    //   unless the user explicitly sets an API key in a config file or via the OPENAI_API_KEY
    //   environment variable. This prevents accidental use of remote APIs during local runs.
    // - The database defaults point to a local CouchDB instance and a development database
    //   name (`rewren-dev`). Adjust these values in `rewren.toml` or via environment variables.
    fn default() -> Self {
        let mut providers = HashMap::new();

        // Check for provider API keys in environment
        if let Ok(key) = std::env::var("NVIDIA_API_KEY") {
            providers.insert(
                "nvidia".to_string(),
                ProviderConfig {
                    name: "nvidia".to_string(),
                    api_key: key,
                    base_url: "https://integrate.api.nvidia.com/v1".to_string(),
                    default_model: "openai/gpt-oss-120b".to_string(),
                    max_tokens: 4096,
                    temperature: 1.0,
                    use_harmony: true,
                },
            );
        }

        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            providers.insert(
                "openai".to_string(),
                ProviderConfig {
                    name: "openai".to_string(),
                    api_key: key,
                    base_url: "https://api.openai.com/v1".to_string(),
                    default_model: "gpt-4".to_string(),
                    max_tokens: 4096,
                    temperature: 0.7,
                    use_harmony: false,
                },
            );
        }

        Self {
            database: DatabaseConfig {
                url: "http://localhost:5984".to_string(),
                name: "rewren-dev".to_string(),
                username: None,
                password: None,
            },
            openai: Some(OpenAIConfig {
                api_key: "".to_string(),
                base_url: None,
                default_model: "gpt-3.5-turbo".to_string(),
                embedding_model: "text-embedding-ada-002".to_string(),
                max_tokens: 1000,
                temperature: 0.7,
            }),
            local_llm: None,
            providers,
            tui: TuiConfig {
                enable_mouse: true,
                theme: "default".to_string(),
                keybindings: HashMap::from([
                    ("quit".to_string(), "q".to_string()),
                    ("search".to_string(), "enter".to_string()),
                    ("navigate_up".to_string(), "up".to_string()),
                    ("navigate_down".to_string(), "down".to_string()),
                ]),
            },
            qa: QAConfig {
                enabled: false,
                screenshot_dir: "./screenshots".to_string(),
                auto_screenshot: false,
                test_timeout_seconds: 30,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                file: None,
                max_file_size_mb: 10,
                max_files: 5,
            },
        }
    }
}

impl Config {
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();

        if !path.exists() {
            let default_config = Self::default();
            default_config.save_to_file(path)?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(path).map_err(Wren3Error::Io)?;

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("toml");

        let config: Config = match extension {
            "toml" => toml::from_str(&content)
                .map_err(|e| Wren3Error::Config(format!("Failed to parse TOML config: {}", e)))?,
            "yaml" | "yml" => serde_yaml::from_str(&content)
                .map_err(|e| Wren3Error::Config(format!("Failed to parse YAML config: {}", e)))?,
            _ => {
                return Err(Wren3Error::Config(format!(
                    "Unsupported config file extension: {}",
                    extension
                )))
            }
        };

        config.validate()?;
        Ok(config)
    }

    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let path = path.as_ref();

        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(Wren3Error::Io)?;
        }

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("toml");

        let content = match extension {
            "toml" => toml::to_string_pretty(self).map_err(|e| {
                Wren3Error::Config(format!("Failed to serialize config to TOML: {}", e))
            })?,
            "yaml" | "yml" => serde_yaml::to_string(self).map_err(|e| {
                Wren3Error::Config(format!("Failed to serialize config to YAML: {}", e))
            })?,
            _ => {
                return Err(Wren3Error::Config(format!(
                    "Unsupported config file extension: {}",
                    extension
                )))
            }
        };

        fs::write(path, content).map_err(Wren3Error::Io)?;

        Ok(())
    }

    pub fn validate(&self) -> Result<()> {
        // Validate database config
        if self.database.url.trim().is_empty() {
            return Err(Wren3Error::Validation(
                "Database URL cannot be empty".to_string(),
            ));
        }

        // Validate URL format
        if !self.database.url.starts_with("http://") && !self.database.url.starts_with("https://") {
            return Err(Wren3Error::Validation(format!(
                "Database URL must start with http:// or https://, got: {}",
                self.database.url
            )));
        }

        if self.database.name.trim().is_empty() {
            return Err(Wren3Error::Validation(
                "Database name cannot be empty".to_string(),
            ));
        }

        // Validate OpenAI config if present and not empty
        if let Some(openai) = &self.openai {
            // Only validate if API key is provided (not empty)
            if !openai.api_key.trim().is_empty() {
                if openai.default_model.trim().is_empty() {
                    return Err(Wren3Error::Validation(
                        "OpenAI default model cannot be empty when API key is provided".to_string(),
                    ));
                }
                if openai.max_tokens == 0 {
                    return Err(Wren3Error::Validation(
                        "OpenAI max tokens must be greater than 0".to_string(),
                    ));
                }
                if openai.max_tokens > 32000 {
                    return Err(Wren3Error::Validation(format!(
                        "OpenAI max tokens too high ({}), maximum is 32000",
                        openai.max_tokens
                    )));
                }
                if openai.temperature < 0.0 || openai.temperature > 2.0 {
                    return Err(Wren3Error::Validation(format!(
                        "OpenAI temperature must be between 0.0 and 2.0, got: {}",
                        openai.temperature
                    )));
                }
            }
        }

        // Validate local LLM config if present and not empty
        if let Some(local) = &self.local_llm {
            // Only validate if endpoint is provided (not empty)
            if !local.endpoint.trim().is_empty() {
                if local.model_name.trim().is_empty() {
                    return Err(Wren3Error::Validation(
                        "Local LLM model name cannot be empty when endpoint is provided"
                            .to_string(),
                    ));
                }
                if local.temperature < 0.0 || local.temperature > 2.0 {
                    return Err(Wren3Error::Validation(format!(
                        "Local LLM temperature must be between 0.0 and 2.0, got: {}",
                        local.temperature
                    )));
                }
            }
        }

        // Validate QA config
        if self.qa.test_timeout_seconds == 0 {
            return Err(Wren3Error::Validation(
                "QA test timeout must be greater than 0".to_string(),
            ));
        }
        if self.qa.test_timeout_seconds > 600 {
            // 10 minutes max
            return Err(Wren3Error::Validation(format!(
                "QA test timeout too high ({}s), maximum is 600s",
                self.qa.test_timeout_seconds
            )));
        }

        // Validate path security for screenshot directory
        let screenshot_path = &self.qa.screenshot_dir;
        if screenshot_path.contains("..") {
            return Err(Wren3Error::Validation(
                "Screenshot directory cannot contain path traversal sequences (..)".to_string(),
            ));
        }
        if screenshot_path.starts_with("/etc") || screenshot_path.starts_with("/root") {
            return Err(Wren3Error::Validation(
                "Screenshot directory cannot point to system directories".to_string(),
            ));
        }

        // Validate logging level
        let valid_levels = ["error", "warn", "info", "debug", "trace"];
        if !valid_levels.contains(&self.logging.level.as_str()) {
            return Err(Wren3Error::Validation(format!(
                "Invalid logging level: {}. Valid levels are: {}",
                self.logging.level,
                valid_levels.join(", ")
            )));
        }

        // Validate logging file size bounds
        if self.logging.max_file_size_mb == 0 {
            return Err(Wren3Error::Validation(
                "Log file size must be greater than 0MB".to_string(),
            ));
        }
        if self.logging.max_file_size_mb > 1000 {
            // 1GB max
            return Err(Wren3Error::Validation(format!(
                "Log file size too large ({}MB), maximum is 1000MB",
                self.logging.max_file_size_mb
            )));
        }

        Ok(())
    }

    pub fn get_config_paths() -> Vec<String> {
        vec![
            "./rewren.toml".to_string(),
            "./rewren.yaml".to_string(),
            "./config/rewren.toml".to_string(),
            "./config/rewren.yaml".to_string(),
            "~/rewren.toml".to_string(),
            "~/rewren.yaml".to_string(),
            "~/.config/rewren.toml".to_string(),
            "~/.config/rewren.yaml".to_string(),
        ]
    }

    pub fn load() -> Result<Self> {
        for path_str in Self::get_config_paths() {
            let path = shellexpand::tilde(&path_str).to_string();
            let path = Path::new(&path);

            if path.exists() {
                return Self::load_from_file(path);
            }
        }

        // If no config file exists, create default in current directory
        let default_path = Path::new("./rewren.toml");
        let config = Self::default();
        config.save_to_file(default_path)?;
        Ok(config)
    }

    pub fn merge_with_env(&mut self) -> Result<()> {
        // Override with environment variables
        if let Ok(url) = std::env::var("WREN3_DATABASE_URL") {
            self.database.url = url;
        }
        if let Ok(name) = std::env::var("WREN3_DATABASE_NAME") {
            self.database.name = name;
        }
        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            if let Some(openai) = &mut self.openai {
                openai.api_key = key;
            }
        }
        if let Ok(level) = std::env::var("WREN3_LOG_LEVEL") {
            self.logging.level = level;
        }

        self.validate()?;
        Ok(())
    }
}

#[derive(Debug)]
pub struct ConfigManager {
    config: Config,
    #[allow(dead_code)]
    config_path: Option<String>,
}

impl ConfigManager {
    pub fn new() -> Result<Self> {
        let mut config = Config::load()?;
        config.merge_with_env()?;
        Ok(Self {
            config,
            config_path: None,
        })
    }

    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let config = Config::load_from_file(&path)?;
        Ok(Self {
            config,
            config_path: Some(path.as_ref().to_string_lossy().to_string()),
        })
    }

    pub fn get_config(&self) -> &Config {
        &self.config
    }

    #[allow(dead_code)]
    pub fn get_config_mut(&mut self) -> &mut Config {
        &mut self.config
    }

    #[allow(dead_code)]
    pub fn save(&self) -> Result<()> {
        if let Some(path) = &self.config_path {
            self.config.save_to_file(path)?;
        } else {
            self.config.save_to_file("./rewren.toml")?;
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn reload(&mut self) -> Result<()> {
        if let Some(path) = &self.config_path {
            self.config = Config::load_from_file(path)?;
        } else {
            self.config = Config::load()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::NamedTempFile;

    #[test]
    fn test_config_default_values() {
        let config = Config::default();

        assert_eq!(config.database.url, "http://localhost:5984");
        assert_eq!(config.database.name, "rewren-dev");
        assert!(config.openai.is_some()); // Default config has OpenAI enabled
        assert_eq!(
            config.openai.as_ref().unwrap().default_model,
            "gpt-3.5-turbo"
        );
        assert_eq!(
            config.openai.as_ref().unwrap().embedding_model,
            "text-embedding-ada-002"
        );
        assert_eq!(config.tui.theme, "default");
        assert!(config.tui.enable_mouse);
    }

    #[test]
    fn test_config_load_from_file() -> Result<()> {
        let temp_file = NamedTempFile::new()?;
        let config_path = temp_file.path();

        // Write a test config
        let test_config = r#"
[database]
url = "http://test:5984"
name = "test-db"

[openai]
api_key = "test-key"
default_model = "gpt-4"
embedding_model = "text-embedding-ada-002"
max_tokens = 2000
temperature = 0.8

[tui]
theme = "dark"
enable_mouse = false
keybindings = {}

[qa]
enabled = true
screenshot_dir = "./test-screenshots"
auto_screenshot = true
test_timeout_seconds = 60

[logging]
level = "info"
max_file_size_mb = 10
max_files = 5
"#;

        std::fs::write(config_path, test_config)?;

        let config = Config::load_from_file(config_path)?;

        assert_eq!(config.database.url, "http://test:5984");
        assert_eq!(config.database.name, "test-db");
        assert_eq!(config.openai.as_ref().unwrap().api_key, "test-key");
        assert_eq!(config.openai.as_ref().unwrap().default_model, "gpt-4");
        assert_eq!(config.tui.theme, "dark");
        assert!(!config.tui.enable_mouse);

        Ok(())
    }

    #[test]
    fn test_config_manager_new() -> Result<()> {
        // Change to a temporary directory to avoid loading existing config
        let temp_dir = tempfile::tempdir()?;
        std::env::set_current_dir(temp_dir.path())?;

        // Set required environment variables to avoid validation errors
        env::set_var("OPENAI_API_KEY", "test-key");

        let manager = ConfigManager::new()?;

        // Should load default config
        assert_eq!(manager.get_config().database.url, "http://localhost:5984");

        // Clean up
        env::remove_var("OPENAI_API_KEY");

        Ok(())
    }

    #[test]
    fn test_config_manager_save_and_reload() -> Result<()> {
        let temp_dir = tempfile::tempdir()?;
        let config_path = temp_dir.path().join("config.toml");

        let mut manager = ConfigManager::from_file(&config_path)?;
        manager.get_config_mut().database.url = "http://example:5984".to_string();
        manager.save()?;

        manager.get_config_mut().database.url = "http://mutated:5984".to_string();
        manager.reload()?;

        assert_eq!(manager.get_config().database.url, "http://example:5984");

        Ok(())
    }

    #[test]
    fn test_config_validation() {
        // Create a valid config for testing
        let mut config = Config {
            database: DatabaseConfig {
                url: "http://localhost:5984".to_string(),
                name: "test-db".to_string(),
                username: None,
                password: None,
            },
            openai: Some(OpenAIConfig {
                api_key: "test-key".to_string(),
                base_url: None,
                default_model: "gpt-3.5-turbo".to_string(),
                embedding_model: "text-embedding-ada-002".to_string(),
                max_tokens: 1000,
                temperature: 0.7,
            }),
            local_llm: None,
            tui: TuiConfig {
                enable_mouse: true,
                theme: "default".to_string(),
                keybindings: HashMap::new(),
            },
            qa: QAConfig {
                enabled: false,
                screenshot_dir: "./screenshots".to_string(),
                auto_screenshot: false,
                test_timeout_seconds: 30,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                file: None,
                max_file_size_mb: 10,
                max_files: 5,
            },
        };

        // Test valid config
        assert!(config.validate().is_ok());

        // Test invalid database URL
        config.database.url = "".to_string();
        assert!(config.validate().is_err());

        // Reset and test empty database name
        config.database.url = "http://localhost:5984".to_string();
        config.database.name = "".to_string();
        assert!(config.validate().is_err());

        // Reset and test empty OpenAI API key -- validation should be skipped when API key is empty
        config.database.name = "test-db".to_string();
        config.openai.as_mut().unwrap().api_key = "".to_string();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation_bounds_checking() {
        let mut config = Config::default();
        // Default config has an empty OpenAI API key; enable validation by supplying a non-empty key
        config.openai.as_mut().unwrap().api_key = "test-key".to_string();

        // Test OpenAI temperature bounds
        config.openai.as_mut().unwrap().temperature = -1.0;
        assert!(config.validate().is_err());

        config.openai.as_mut().unwrap().temperature = 3.0;
        assert!(config.validate().is_err());

        // Reset to valid and test max_tokens bounds
        config.openai.as_mut().unwrap().temperature = 0.7;
        config.openai.as_mut().unwrap().max_tokens = 0;
        assert!(config.validate().is_err());

        config.openai.as_mut().unwrap().max_tokens = 100000;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_url_format() {
        let mut config = Config::default();

        // Test invalid database URL format
        config.database.url = "not-a-url".to_string();
        let result = config.validate();
        println!("Validation result for 'not-a-url': {:?}", result);
        assert!(result.is_err());

        config.database.url = "ftp://localhost:5984".to_string();
        let result = config.validate();
        println!("Validation result for 'ftp://localhost:5984': {:?}", result);
        assert!(result.is_err());

        // Reset to valid URL
        config.database.url = "http://localhost:5984".to_string();
        let result = config.validate();
        println!(
            "Validation result for 'http://localhost:5984': {:?}",
            result
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_config_validation_path_security() {
        let mut config = Config::default();

        // Test path traversal attempts in screenshot directory
        config.qa.screenshot_dir = "../../../etc/passwd".to_string();
        assert!(config.validate().is_err());

        config.qa.screenshot_dir = "/etc/shadow".to_string();
        assert!(config.validate().is_err());

        // Reset to safe path
        config.qa.screenshot_dir = "./screenshots".to_string();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation_timeout_bounds() {
        let mut config = Config::default();

        // Test QA timeout bounds
        config.qa.test_timeout_seconds = 0;
        assert!(config.validate().is_err());

        config.qa.test_timeout_seconds = 3600; // 1 hour should be too long
        assert!(config.validate().is_err());

        // Reset to reasonable timeout
        config.qa.test_timeout_seconds = 30;
        assert!(config.validate().is_ok());
    }
}
