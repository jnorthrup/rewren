use couch_rs::error::CouchError;
use std::fmt;
use tracing::{error, info, warn, Level};
use tracing_subscriber::{EnvFilter, FmtSubscriber};

#[derive(Debug)]
pub enum Wren3Error {
    Database(anyhow::Error),
    Network(reqwest::Error),
    Python(PyErrWrapper),
    Io(std::io::Error),
    Config(String),
    Validation(String),
    #[allow(dead_code)]
    Tmux(String),
    OpenAI(String),
}

#[derive(Debug)]
pub struct PyErrWrapper(pub pyo3::PyErr);

impl fmt::Display for PyErrWrapper {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Python error: {:?}", self.0)
    }
}

impl fmt::Display for Wren3Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Wren3Error::Database(e) => write!(f, "Database error: {}", e),
            Wren3Error::Network(e) => write!(f, "Network error: {}", e),
            Wren3Error::Python(e) => write!(f, "{}", e),
            Wren3Error::Io(e) => write!(f, "IO error: {}", e),
            Wren3Error::Config(msg) => write!(f, "Configuration error: {}", msg),
            Wren3Error::Validation(msg) => write!(f, "Validation error: {}", msg),
            Wren3Error::Tmux(msg) => write!(f, "Tmux error: {}", msg),
            Wren3Error::OpenAI(msg) => write!(f, "OpenAI error: {}", msg),
        }
    }
}

impl std::error::Error for Wren3Error {}

impl From<anyhow::Error> for Wren3Error {
    fn from(err: anyhow::Error) -> Self {
        Wren3Error::Database(err)
    }
}

impl From<CouchError> for Wren3Error {
    fn from(err: CouchError) -> Self {
        Wren3Error::Database(anyhow::Error::from(err))
    }
}

impl From<serde_json::Error> for Wren3Error {
    fn from(err: serde_json::Error) -> Self {
        Wren3Error::Config(format!("JSON error: {}", err))
    }
}

impl From<reqwest::Error> for Wren3Error {
    fn from(err: reqwest::Error) -> Self {
        Wren3Error::Network(err)
    }
}

impl From<pyo3::PyErr> for Wren3Error {
    fn from(err: pyo3::PyErr) -> Self {
        Wren3Error::Python(PyErrWrapper(err))
    }
}

impl From<std::io::Error> for Wren3Error {
    fn from(err: std::io::Error) -> Self {
        Wren3Error::Io(err)
    }
}

pub type Result<T> = std::result::Result<T, Wren3Error>;

pub fn init_logging() -> Result<()> {
    let filter = EnvFilter::from_default_env()
        .add_directive("wren3=info".parse().unwrap())
        .add_directive("pyo3=warn".parse().unwrap());

    let subscriber = FmtSubscriber::builder()
        .with_env_filter(filter)
        .with_max_level(Level::INFO)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| Wren3Error::Config(format!("Failed to set tracing subscriber: {}", e)))?;

    info!("Logging initialized");
    Ok(())
}

pub fn log_operation_start(operation: &str) {
    info!("Starting operation: {}", operation);
}

pub fn log_operation_end(operation: &str, success: bool) {
    if success {
        info!("Operation completed successfully: {}", operation);
    } else {
        error!("Operation failed: {}", operation);
    }
}

pub fn log_error(context: &str, error: &Wren3Error) {
    error!("Error in {}: {}", context, error);
}

#[allow(dead_code)]
pub fn log_warning(message: &str) {
    warn!("{}", message);
}

pub fn log_info(message: &str) {
    info!("{}", message);
}

pub struct ErrorHandler;

#[allow(dead_code)]
impl ErrorHandler {
    #[allow(dead_code)]
    pub fn handle_error(error: Wren3Error, context: &str) -> Wren3Error {
        log_error(context, &error);
        error
    }

    /// Determines if an error is recoverable and should be retried
    pub fn is_recoverable_error(error: &Wren3Error) -> bool {
        match error {
            Wren3Error::Network(_) => true,  // Network errors are often temporary
            Wren3Error::Database(_) => true, // Database connection issues might recover
            Wren3Error::Tmux(_) => true,     // Tmux issues might be temporary
            Wren3Error::Python(_) => false,  // Python errors are typically logic issues
            Wren3Error::Io(_) => false,      // IO errors are usually permanent
            Wren3Error::Config(_) => false,  // Config errors need manual fixing
            Wren3Error::Validation(_) => false, // Validation errors need input fixing
            Wren3Error::OpenAI(_) => true,   // API errors might be rate limits or temporary
        }
    }

    /// Retry an operation with exponential backoff for recoverable errors
    pub async fn retry_with_backoff<T, F, Fut>(
        operation: F,
        max_attempts: u32,
        base_delay_ms: u64,
    ) -> Result<T>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let mut attempt = 0;
        let mut last_error = None;

        while attempt < max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    if !Self::is_recoverable_error(&error) {
                        return Err(error);
                    }

                    last_error = Some(error);
                    attempt += 1;

                    if attempt < max_attempts {
                        let delay = base_delay_ms * 2_u64.pow(attempt);
                        log_warning(&format!(
                            "Attempt {} failed, retrying in {}ms",
                            attempt, delay
                        ));
                        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| Wren3Error::Config("No attempts made".to_string())))
    }

    pub fn handle_result<T>(result: anyhow::Result<T>, context: &str) -> Result<T> {
        match result {
            Ok(value) => Ok(value),
            Err(err) => Err(Wren3Error::Config(format!("{}: {}", context, err))),
        }
    }

    pub fn validate_not_empty(value: &str, field_name: &str) -> Result<()> {
        if value.trim().is_empty() {
            return Err(Wren3Error::Validation(format!(
                "{} cannot be empty",
                field_name
            )));
        }
        Ok(())
    }

    pub fn validate_range(value: f64, min: f64, max: f64, field_name: &str) -> Result<()> {
        if value < min || value > max {
            return Err(Wren3Error::Validation(format!(
                "{} must be between {} and {}, got {}",
                field_name, min, max, value
            )));
        }
        Ok(())
    }

    pub fn validate_positive(value: f64, field_name: &str) -> Result<()> {
        if value <= 0.0 {
            return Err(Wren3Error::Validation(format!(
                "{} must be positive, got {}",
                field_name, value
            )));
        }
        Ok(())
    }
}

pub struct PerformanceMonitor {
    start_time: std::time::Instant,
    operation: String,
}

impl PerformanceMonitor {
    pub fn start(operation: &str) -> Self {
        log_operation_start(operation);
        Self {
            start_time: std::time::Instant::now(),
            operation: operation.to_string(),
        }
    }

    pub fn end(self, success: bool) -> f64 {
        let duration = self.start_time.elapsed().as_secs_f64();
        log_operation_end(&self.operation, success);
        if success {
            info!(
                "Operation '{}' completed in {:.2}s",
                self.operation, duration
            );
        } else {
            warn!(
                "Operation '{}' failed after {:.2}s",
                self.operation, duration
            );
        }
        duration
    }
}

#[macro_export]
macro_rules! log_performance {
    ($operation:expr, $code:block) => {{
        let __monitor = $crate::error_handling::PerformanceMonitor::start($operation);
        let __result = $code;
        // The code block may not return a Result type, so we'll just report success by default
        let __duration = __monitor.end(true);
        __result
    }};
}

#[macro_export]
macro_rules! handle_error {
    ($result:expr, $context:expr) => {
        $result.map_err(|e| $crate::error_handling::ErrorHandler::handle_error(e, $context))?
    };
}

#[macro_export]
macro_rules! validate {
    ($condition:expr, $error:expr) => {
        if !$condition {
            return Err($crate::error_handling::Wren3Error::Validation(
                $error.to_string(),
            ));
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn test_wren3_error_display() {
        let db_err = Wren3Error::Database(anyhow::anyhow!("test db error"));
        assert!(db_err.to_string().contains("Database error"));

        let config_err = Wren3Error::Config("test config error".to_string());
        assert_eq!(
            config_err.to_string(),
            "Configuration error: test config error"
        );

        let validation_err = Wren3Error::Validation("test validation error".to_string());
        assert_eq!(
            validation_err.to_string(),
            "Validation error: test validation error"
        );

        let tmux_err = Wren3Error::Tmux("test tmux error".to_string());
        assert_eq!(tmux_err.to_string(), "Tmux error: test tmux error");

        let openai_err = Wren3Error::OpenAI("test openai error".to_string());
        assert_eq!(openai_err.to_string(), "OpenAI error: test openai error");
    }

    #[test]
    fn test_from_implementations() {
        // Test anyhow::Error -> Wren3Error
        let anyhow_err = anyhow::anyhow!("test error");
        let wren_err: Wren3Error = anyhow_err.into();
        match wren_err {
            Wren3Error::Database(_) => {}
            _ => panic!("Expected Database error"),
        }

        // Test serde_json::Error -> Wren3Error
        let json_str = "{ invalid json";
        let json_err: serde_json::Error =
            serde_json::from_str::<serde_json::Value>(json_str).unwrap_err();
        let wren_err: Wren3Error = json_err.into();
        match wren_err {
            Wren3Error::Config(msg) => assert!(msg.contains("JSON error")),
            _ => panic!("Expected Config error"),
        }

        // Test std::io::Error -> Wren3Error
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let wren_err: Wren3Error = io_err.into();
        match wren_err {
            Wren3Error::Io(_) => {}
            _ => panic!("Expected Io error"),
        }
    }

    #[test]
    fn test_error_handler_validate_not_empty() {
        // Test valid non-empty string
        assert!(ErrorHandler::validate_not_empty("test", "field").is_ok());

        // Test empty string
        let result = ErrorHandler::validate_not_empty("", "field");
        assert!(result.is_err());
        match result.unwrap_err() {
            Wren3Error::Validation(msg) => assert!(msg.contains("cannot be empty")),
            _ => panic!("Expected Validation error"),
        }

        // Test whitespace-only string
        let result = ErrorHandler::validate_not_empty("   ", "field");
        assert!(result.is_err());
    }

    #[test]
    fn test_error_handler_validate_range() {
        // Test valid value in range
        assert!(ErrorHandler::validate_range(5.0, 0.0, 10.0, "field").is_ok());

        // Test value below minimum
        let result = ErrorHandler::validate_range(-1.0, 0.0, 10.0, "field");
        assert!(result.is_err());
        match result.unwrap_err() {
            Wren3Error::Validation(msg) => assert!(msg.contains("must be between")),
            _ => panic!("Expected Validation error"),
        }

        // Test value above maximum
        let result = ErrorHandler::validate_range(15.0, 0.0, 10.0, "field");
        assert!(result.is_err());
    }

    #[test]
    fn test_error_handler_validate_positive() {
        // Test positive value
        assert!(ErrorHandler::validate_positive(5.0, "field").is_ok());

        // Test zero
        let result = ErrorHandler::validate_positive(0.0, "field");
        assert!(result.is_err());
        match result.unwrap_err() {
            Wren3Error::Validation(msg) => assert!(msg.contains("must be positive")),
            _ => panic!("Expected Validation error"),
        }

        // Test negative value
        let result = ErrorHandler::validate_positive(-1.0, "field");
        assert!(result.is_err());
    }

    #[test]
    fn test_log_warning_no_panic() {
        log_warning("test warning message");
    }

    #[test]
    fn test_performance_monitor() {
        let monitor = PerformanceMonitor::start("test_operation");
        std::thread::sleep(std::time::Duration::from_millis(10)); // Small delay
        let duration = monitor.end(true);

        assert!(duration >= 0.01); // Should be at least 10ms
        assert!(duration < 1.0); // Should be reasonable
    }

    #[test]
    fn test_error_handler_handle_result() {
        // Test successful result
        let result: anyhow::Result<i32> = Ok(42);
        let handled = ErrorHandler::handle_result(result, "test context");
        assert_eq!(handled.unwrap(), 42);

        // Test error result
        let result: anyhow::Result<i32> = Err(anyhow::anyhow!("test error"));
        let handled = ErrorHandler::handle_result(result, "test context");
        assert!(handled.is_err());
        match handled.unwrap_err() {
            Wren3Error::Config(msg) => assert!(msg.contains("test context")),
            _ => panic!("Expected Config error"),
        }
    }

    #[tokio::test]
    async fn test_is_recoverable_error() {
        // Test recoverable errors
        let network_error = reqwest::Client::new()
            .get("http://invalid-url-that-does-not-exist.invalid")
            .send()
            .await
            .unwrap_err();
        assert!(ErrorHandler::is_recoverable_error(&Wren3Error::Network(
            network_error
        )));

        assert!(ErrorHandler::is_recoverable_error(&Wren3Error::OpenAI(
            "Rate limit exceeded".to_string()
        )));
        assert!(ErrorHandler::is_recoverable_error(&Wren3Error::Database(
            anyhow::anyhow!("Connection failed")
        )));

        // Test non-recoverable errors
        assert!(!ErrorHandler::is_recoverable_error(
            &Wren3Error::Validation("Invalid input".to_string())
        ));
        assert!(!ErrorHandler::is_recoverable_error(&Wren3Error::Config(
            "Missing config".to_string()
        )));
        assert!(!ErrorHandler::is_recoverable_error(&Wren3Error::Python(
            PyErrWrapper(pyo3::exceptions::PyRuntimeError::new_err("Python error"))
        )));
    }

    #[tokio::test]
    async fn test_retry_with_backoff_success_on_first_try() {
        let operation = || async { Ok(42) };

        let result = ErrorHandler::retry_with_backoff(operation, 3, 10).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_with_backoff_non_recoverable_error() {
        let operation = || async { Err(Wren3Error::Validation("Bad input".to_string())) };

        let result: Result<i32> = ErrorHandler::retry_with_backoff(operation, 3, 10).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            Wren3Error::Validation(_) => {} // Expected
            _ => panic!("Expected Validation error"),
        }
    }

    #[tokio::test]
    async fn test_retry_with_backoff_eventually_succeeds() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let attempt_count = Arc::new(AtomicU32::new(0));
        let attempt_count_clone = attempt_count.clone();

        let operation = move || {
            let count = attempt_count_clone.clone();
            async move {
                let current_attempt = count.fetch_add(1, Ordering::SeqCst);
                if current_attempt < 2 {
                    // Create a network error by making a request to an invalid URL
                    let network_error = reqwest::Client::new()
                        .get("http://invalid-url-12345.invalid")
                        .send()
                        .await
                        .unwrap_err();
                    Err(Wren3Error::Network(network_error))
                } else {
                    Ok(42)
                }
            }
        };

        let result = ErrorHandler::retry_with_backoff(operation, 3, 1).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3); // Failed twice, succeeded on third
    }

    #[tokio::test]
    async fn test_retry_with_backoff_exhausts_attempts() {
        let operation = || async {
            // Create a network error by making a request to an invalid URL
            let network_error = reqwest::Client::new()
                .get("http://invalid-url-67890.invalid")
                .send()
                .await
                .unwrap_err();
            Err(Wren3Error::Network(network_error))
        };

        let result: Result<i32> = ErrorHandler::retry_with_backoff(operation, 2, 1).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            Wren3Error::Network(_) => {} // Expected
            _ => panic!("Expected Network error"),
        }
    }
}
