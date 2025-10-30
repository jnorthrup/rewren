use anyhow::Result;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TmuxScreenshot {
    session_name: Option<String>,
    window_name: Option<String>,
    pane_id: Option<String>,
}

#[allow(dead_code)]
impl TmuxScreenshot {
    pub fn new() -> Self {
        Self {
            session_name: None,
            window_name: None,
            pane_id: None,
        }
    }

    pub fn with_session(mut self, session: &str) -> Self {
        self.session_name = Some(session.to_string());
        self
    }

    pub fn with_window(mut self, window: &str) -> Self {
        self.window_name = Some(window.to_string());
        self
    }

    pub fn with_pane(mut self, pane: &str) -> Self {
        self.pane_id = Some(pane.to_string());
        self
    }

    pub fn detect_current_session(&mut self) -> Result<()> {
        let output = Command::new("tmux")
            .args(["display-message", "-p", "#S"])
            .output()?;

        if output.status.success() {
            let session = String::from_utf8_lossy(&output.stdout).trim().to_string();
            self.session_name = Some(session);
        }

        Ok(())
    }

    pub fn detect_current_window(&mut self) -> Result<()> {
        let output = Command::new("tmux")
            .args(["display-message", "-p", "#W"])
            .output()?;

        if output.status.success() {
            let window = String::from_utf8_lossy(&output.stdout).trim().to_string();
            self.window_name = Some(window);
        }

        Ok(())
    }

    pub fn detect_current_pane(&mut self) -> Result<()> {
        let output = Command::new("tmux")
            .args(["display-message", "-p", "#{pane_id}"])
            .output()?;

        if output.status.success() {
            let pane = String::from_utf8_lossy(&output.stdout).trim().to_string();
            self.pane_id = Some(pane);
        }

        Ok(())
    }

    pub fn capture_pane_content(&self) -> Result<String> {
        let mut args = vec!["capture-pane", "-p"];

        if let Some(ref pane) = self.pane_id {
            args.push("-t");
            args.push(pane);
        }

        let output = Command::new("tmux").args(&args).output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(anyhow::anyhow!(
                "Failed to capture pane: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub fn capture_visible_area(&self) -> Result<String> {
        let mut args = vec!["capture-pane", "-p", "-J"]; // -J includes join lines

        if let Some(ref pane) = self.pane_id {
            args.push("-t");
            args.push(pane);
        }

        let output = Command::new("tmux").args(&args).output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(anyhow::anyhow!(
                "Failed to capture visible area: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }

    pub fn save_screenshot(&self, content: &str, filename: Option<&str>) -> Result<String> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        let filename = filename
            .map(|f| f.to_string())
            .unwrap_or_else(|| format!("tmux_screenshot_{}.txt", timestamp));

        std::fs::write(&filename, content)?;

        Ok(filename)
    }

    pub fn save_screenshot_to_dir(
        &self,
        content: &str,
        filename: Option<&str>,
        dir: &std::path::Path,
    ) -> Result<String> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        let filename = filename
            .map(|f| f.to_string())
            .unwrap_or_else(|| format!("tmux_screenshot_{}.txt", timestamp));

        let filepath = dir.join(&filename);
        std::fs::write(&filepath, content)?;

        Ok(filename)
    }

    pub fn capture_and_save(&self, filename: Option<&str>) -> Result<String> {
        let content = self.capture_visible_area()?;
        self.save_screenshot(&content, filename)
    }

    pub fn is_tmux_running() -> bool {
        Command::new("tmux")
            .arg("has-session")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    pub fn get_session_info(&self) -> Result<String> {
        let output = Command::new("tmux")
            .args(["display-message", "-p", "#S:#I.#P - #W"])
            .output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(anyhow::anyhow!("Failed to get session info"))
        }
    }
}

#[derive(Debug)]
pub struct QAScreenshotCapture {
    screenshot_dir: std::path::PathBuf,
    test_case_counter: std::sync::atomic::AtomicUsize,
}

impl QAScreenshotCapture {
    pub fn new(screenshot_dir: &str) -> Self {
        let dir = std::path::PathBuf::from(screenshot_dir);
        std::fs::create_dir_all(&dir).ok();

        Self {
            screenshot_dir: dir,
            test_case_counter: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    pub fn capture_test_screenshot(&self, test_name: &str, description: &str) -> Result<String> {
        if !TmuxScreenshot::is_tmux_running() {
            return Err(anyhow::anyhow!(
                "tmux not running, cannot capture screenshot"
            ));
        }

        let mut tmux = TmuxScreenshot::new();
        tmux.detect_current_session()?;
        tmux.detect_current_window()?;
        tmux.detect_current_pane()?;

        let content = tmux.capture_visible_area()?;

        let counter = self
            .test_case_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        let filename = format!(
            "qa_{}_{}_{}_{}.txt",
            test_name,
            counter,
            timestamp,
            description.replace(" ", "_")
        );

        let filepath = self.screenshot_dir.join(&filename);
        std::fs::write(&filepath, &content)?;

        Ok(filename)
    }

    pub fn generate_qa_report(&self, test_results: &[QATestResult]) -> Result<String> {
        let mut report = String::new();
        report.push_str("=== QA Test Report ===\n\n");

        let total_tests = test_results.len();
        let passed_tests = test_results.iter().filter(|r| r.passed).count();
        let failed_tests = total_tests - passed_tests;

        report.push_str(&format!("Total Tests: {}\n", total_tests));
        report.push_str(&format!("Passed: {}\n", passed_tests));
        report.push_str(&format!("Failed: {}\n\n", failed_tests));

        for result in test_results {
            report.push_str(&format!("Test: {}\n", result.test_name));
            report.push_str(&format!(
                "Status: {}\n",
                if result.passed { "PASS" } else { "FAIL" }
            ));
            report.push_str(&format!("Duration: {:.2}s\n", result.duration));
            if !result.error_message.is_empty() {
                report.push_str(&format!("Error: {}\n", result.error_message));
            }
            if !result.screenshot_file.is_empty() {
                report.push_str(&format!("Screenshot: {}\n", result.screenshot_file));
            }
            report.push('\n');
        }

        let report_filename = format!(
            "qa_report_{}.txt",
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()
        );

        let report_path = self.screenshot_dir.join(&report_filename);
        std::fs::write(&report_path, &report)?;

        Ok(report_filename)
    }
}

#[derive(Debug, Clone)]
pub struct QATestResult {
    pub test_name: String,
    pub passed: bool,
    pub duration: f64,
    pub error_message: String,
    pub screenshot_file: String,
}

impl QATestResult {
    pub fn new(test_name: &str) -> Self {
        Self {
            test_name: test_name.to_string(),
            passed: false,
            duration: 0.0,
            error_message: String::new(),
            screenshot_file: String::new(),
        }
    }

    pub fn pass(mut self) -> Self {
        self.passed = true;
        self
    }

    pub fn fail(mut self, error: &str) -> Self {
        self.passed = false;
        self.error_message = error.to_string();
        self
    }

    pub fn duration(mut self, duration: f64) -> Self {
        self.duration = duration;
        self
    }

    pub fn screenshot(mut self, file: &str) -> Self {
        self.screenshot_file = file.to_string();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_tmux_screenshot_new() {
        let tmux = TmuxScreenshot::new();
        assert!(tmux.session_name.is_none());
        assert!(tmux.window_name.is_none());
        assert!(tmux.pane_id.is_none());
    }

    #[test]
    fn test_tmux_screenshot_with_session() {
        let tmux = TmuxScreenshot::new().with_session("test-session");
        assert_eq!(tmux.session_name, Some("test-session".to_string()));
    }

    #[test]
    fn test_tmux_screenshot_with_window() {
        let tmux = TmuxScreenshot::new().with_window("test-window");
        assert_eq!(tmux.window_name, Some("test-window".to_string()));
    }

    #[test]
    fn test_tmux_screenshot_with_pane() {
        let tmux = TmuxScreenshot::new().with_pane("test-pane");
        assert_eq!(tmux.pane_id, Some("test-pane".to_string()));
    }

    #[test]
    fn test_tmux_screenshot_builder_pattern() {
        let tmux = TmuxScreenshot::new()
            .with_session("session1")
            .with_window("window1")
            .with_pane("pane1");

        assert_eq!(tmux.session_name, Some("session1".to_string()));
        assert_eq!(tmux.window_name, Some("window1".to_string()));
        assert_eq!(tmux.pane_id, Some("pane1".to_string()));
    }

    #[test]
    fn test_save_screenshot_with_custom_filename() {
        let temp_dir = tempdir().unwrap();
        let temp_path = temp_dir.path();

        let tmux = TmuxScreenshot::new();
        let content = "test screenshot content";
        let filename = "custom_screenshot.txt";

        let result = tmux.save_screenshot_to_dir(content, Some(filename), temp_path);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), filename);

        // Verify file was created with correct content
        let file_content = std::fs::read_to_string(temp_path.join(filename)).unwrap();
        assert_eq!(file_content, content);
    }

    #[test]
    fn test_save_screenshot_with_auto_filename() {
        let temp_dir = tempdir().unwrap();
        let temp_path = temp_dir.path();

        let tmux = TmuxScreenshot::new();
        let content = "auto filename content";

        let result = tmux.save_screenshot_to_dir(content, None, temp_path);
        assert!(result.is_ok());

        let filename = result.unwrap();
        assert!(filename.starts_with("tmux_screenshot_"));
        assert!(filename.ends_with(".txt"));

        // Verify file was created with correct content
        let file_content = std::fs::read_to_string(temp_path.join(&filename)).unwrap();
        assert_eq!(file_content, content);
    }

    #[test]
    fn test_qa_screenshot_capture_new() {
        let temp_dir = tempdir().unwrap();
        let capture = QAScreenshotCapture::new(temp_dir.path().to_str().unwrap());

        assert_eq!(capture.screenshot_dir, temp_dir.path());
        assert_eq!(
            capture
                .test_case_counter
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }

    #[test]
    fn test_qa_test_result_new() {
        let result = QATestResult::new("test_case_1");

        assert_eq!(result.test_name, "test_case_1");
        assert!(!result.passed);
        assert_eq!(result.duration, 0.0);
        assert!(result.error_message.is_empty());
        assert!(result.screenshot_file.is_empty());
    }

    #[test]
    fn test_qa_test_result_builder_pattern() {
        let result = QATestResult::new("test_case_2")
            .pass()
            .duration(1.5)
            .screenshot("screenshot.txt");

        assert_eq!(result.test_name, "test_case_2");
        assert!(result.passed);
        assert_eq!(result.duration, 1.5);
        assert_eq!(result.screenshot_file, "screenshot.txt");
        assert!(result.error_message.is_empty());
    }

    #[test]
    fn test_qa_test_result_fail() {
        let result = QATestResult::new("failing_test")
            .fail("Test failed with error")
            .duration(2.0);

        assert_eq!(result.test_name, "failing_test");
        assert!(!result.passed);
        assert_eq!(result.duration, 2.0);
        assert_eq!(result.error_message, "Test failed with error");
    }

    #[test]
    fn test_generate_qa_report() {
        let temp_dir = tempdir().unwrap();
        let capture = QAScreenshotCapture::new(temp_dir.path().to_str().unwrap());

        let results = vec![
            QATestResult::new("test1")
                .pass()
                .duration(1.0)
                .screenshot("shot1.txt"),
            QATestResult::new("test2").fail("error msg").duration(2.0),
            QATestResult::new("test3")
                .pass()
                .duration(0.5)
                .screenshot("shot3.txt"),
        ];

        let report_result = capture.generate_qa_report(&results);
        assert!(report_result.is_ok());

        let report_filename = report_result.unwrap();
        assert!(report_filename.starts_with("qa_report_"));
        assert!(report_filename.ends_with(".txt"));

        // Verify report file exists and contains expected content
        let report_path = temp_dir.path().join(&report_filename);
        assert!(report_path.exists());

        let report_content = fs::read_to_string(&report_path).unwrap();
        assert!(report_content.contains("=== QA Test Report ==="));
        assert!(report_content.contains("Total Tests: 3"));
        assert!(report_content.contains("Passed: 2"));
        assert!(report_content.contains("Failed: 1"));
        assert!(report_content.contains("Test: test1"));
        assert!(report_content.contains("Status: PASS"));
        assert!(report_content.contains("Test: test2"));
        assert!(report_content.contains("Status: FAIL"));
        assert!(report_content.contains("Error: error msg"));
    }

    #[test]
    fn test_qa_screenshot_capture_counter_increment() {
        let temp_dir = tempdir().unwrap();
        let capture = QAScreenshotCapture::new(temp_dir.path().to_str().unwrap());

        // Note: This test would require mocking tmux commands to fully test capture_test_screenshot
        // For now, we just verify the counter starts at 0
        assert_eq!(
            capture
                .test_case_counter
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }
}
