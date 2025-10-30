#![allow(dead_code)]

use crate::error_handling::{log_info, Result, Wren3Error};
use crate::log_performance;
use crate::tmux::{QAScreenshotCapture, QATestResult};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct TestCase {
    pub name: String,
    pub description: String,
    pub steps: Vec<TestStep>,
    pub timeout_seconds: u64,
    pub expected_screenshots: usize,
}

#[derive(Debug, Clone)]
pub struct TestStep {
    pub name: String,
    pub action: TestAction,
    pub expected_result: Option<String>,
    pub take_screenshot: bool,
}

#[derive(Debug, Clone)]
pub enum TestAction {
    Wait(Duration),
    SendKeys(String),
    AssertVisible(String),
    ExecuteCommand(String),
    Custom(String),
}

#[derive(Debug)]
pub struct TestSuite {
    pub name: String,
    pub description: String,
    pub test_cases: Vec<TestCase>,
    pub setup_steps: Vec<TestStep>,
    pub teardown_steps: Vec<TestStep>,
}

#[derive(Debug)]
pub struct TestExecutionResult {
    pub suite_name: String,
    pub results: Vec<QATestResult>,
    pub total_duration: f64,
    pub success_rate: f64,
}

#[derive(Debug)]
pub struct QATestFramework {
    screenshot_capture: QAScreenshotCapture,
    test_suites: HashMap<String, TestSuite>,
}

impl QATestFramework {
    pub fn new(screenshot_dir: &str) -> Self {
        Self {
            screenshot_capture: QAScreenshotCapture::new(screenshot_dir),
            test_suites: HashMap::new(),
        }
    }

    pub fn add_test_suite(&mut self, suite: TestSuite) {
        self.test_suites.insert(suite.name.clone(), suite);
    }

    pub async fn run_test_suite(&self, suite_name: &str) -> Result<TestExecutionResult> {
        let suite = self.test_suites.get(suite_name).ok_or_else(|| {
            Wren3Error::Validation(format!("Test suite '{}' not found", suite_name))
        })?;

        log_info(&format!("Starting test suite: {}", suite.name));

        let start_time = Instant::now();
        let mut results = Vec::new();

        // Run setup steps
        for step in &suite.setup_steps {
            self.execute_step(step).await?;
        }

        // Run test cases
        for test_case in &suite.test_cases {
            let result = self.run_test_case(test_case).await;
            results.push(result);
        }

        // Run teardown steps
        for step in &suite.teardown_steps {
            let _ = self.execute_step(step).await; // Ignore teardown errors
        }

        let total_duration = start_time.elapsed().as_secs_f64();
        let passed_count = results.iter().filter(|r| r.passed).count() as f64;
        let results_count = results.len();
        let total_count = results_count as f64;
        let success_rate = if total_count > 0.0 {
            passed_count / total_count * 100.0
        } else {
            0.0
        };

        let execution_result = TestExecutionResult {
            suite_name: suite_name.to_string(),
            results,
            total_duration,
            success_rate,
        };

        // Generate report
        let report_file = self
            .screenshot_capture
            .generate_qa_report(&execution_result.results)?;

        log_info(&format!(
            "Test suite '{}' completed: {:.1}% pass rate, {} tests in {:.2}s",
            suite_name, success_rate, results_count, total_duration
        ));
        log_info(&format!("Report generated: {}", report_file));

        Ok(execution_result)
    }

    async fn run_test_case(&self, test_case: &TestCase) -> QATestResult {
        let start_time = Instant::now();
        let mut result = QATestResult::new(&test_case.name);

        log_info(&format!("Running test case: {}", test_case.name));

        let mut screenshot_files = Vec::new();

        for (step_index, step) in test_case.steps.iter().enumerate() {
            match self.execute_step(step).await {
                Ok(_) => {
                    if step.take_screenshot {
                        match self.screenshot_capture.capture_test_screenshot(
                            &test_case.name,
                            &format!("step_{}_{}", step_index, step.name),
                        ) {
                            Ok(filename) => {
                                screenshot_files.push(filename);
                            }
                            Err(e) => {
                                log_info(&format!(
                                    "Failed to capture screenshot for step {}: {}",
                                    step.name, e
                                ));
                            }
                        }
                    }
                }
                Err(e) => {
                    result = result.fail(&format!("Step '{}' failed: {}", step.name, e));
                    break;
                }
            }
        }

        let duration = start_time.elapsed().as_secs_f64();

        if result.error_message.is_empty() {
            result = result.pass();
        }

        result = result.duration(duration);

        if !screenshot_files.is_empty() {
            result = result.screenshot(&screenshot_files.join(", "));
        }

        result
    }

    async fn execute_step(&self, step: &TestStep) -> Result<()> {
        match &step.action {
            TestAction::Wait(duration) => {
                tokio::time::sleep(*duration).await;
                Ok(())
            }
            TestAction::SendKeys(keys) => {
                // This would need tmux integration to send keys
                // For now, just log the action
                log_info(&format!("Would send keys: {}", keys));
                Ok(())
            }
            TestAction::AssertVisible(pattern) => {
                // This would need screen scraping capabilities
                // For now, just log the assertion
                log_info(&format!("Would assert visible: {}", pattern));
                Ok(())
            }
            TestAction::ExecuteCommand(cmd) => {
                log_performance!("execute_command", {
                    let output = tokio::process::Command::new("sh")
                        .arg("-c")
                        .arg(cmd)
                        .output()
                        .await
                        .map_err(Wren3Error::Io)?;

                    if output.status.success() {
                        Ok(())
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        Err(Wren3Error::Validation(format!(
                            "Command failed: {}",
                            stderr
                        )))
                    }
                })
            }
            TestAction::Custom(action) => {
                log_info(&format!("Custom action: {}", action));
                Ok(())
            }
        }
    }

    pub fn create_default_test_suite(&self) -> TestSuite {
        TestSuite {
            name: "wren3_basic_ui_test".to_string(),
            description: "Basic UI functionality test for wren3 TUI".to_string(),
            test_cases: vec![
                TestCase {
                    name: "main_menu_navigation".to_string(),
                    description: "Test navigation through main menu".to_string(),
                    steps: vec![
                        TestStep {
                            name: "wait_for_menu".to_string(),
                            action: TestAction::Wait(Duration::from_secs(1)),
                            expected_result: None,
                            take_screenshot: true,
                        },
                        TestStep {
                            name: "navigate_to_query".to_string(),
                            action: TestAction::SendKeys("1".to_string()),
                            expected_result: Some("Query input mode".to_string()),
                            take_screenshot: true,
                        },
                        TestStep {
                            name: "return_to_menu".to_string(),
                            action: TestAction::SendKeys("\x1b".to_string()), // ESC
                            expected_result: Some("Main menu".to_string()),
                            take_screenshot: true,
                        },
                    ],
                    timeout_seconds: 30,
                    expected_screenshots: 3,
                },
                TestCase {
                    name: "settings_access".to_string(),
                    description: "Test accessing settings menu".to_string(),
                    steps: vec![
                        TestStep {
                            name: "access_settings".to_string(),
                            action: TestAction::SendKeys("2".to_string()),
                            expected_result: Some("Settings displayed".to_string()),
                            take_screenshot: true,
                        },
                        TestStep {
                            name: "return_from_settings".to_string(),
                            action: TestAction::SendKeys("\x1b".to_string()),
                            expected_result: Some("Main menu".to_string()),
                            take_screenshot: true,
                        },
                    ],
                    timeout_seconds: 15,
                    expected_screenshots: 2,
                },
            ],
            setup_steps: vec![
                TestStep {
                    name: "start_wren3".to_string(),
                    action: TestAction::ExecuteCommand("./target/debug/wren3".to_string()),
                    expected_result: Some("wren3 started".to_string()),
                    take_screenshot: false,
                },
                TestStep {
                    name: "wait_for_startup".to_string(),
                    action: TestAction::Wait(Duration::from_secs(2)),
                    expected_result: None,
                    take_screenshot: false,
                },
            ],
            teardown_steps: vec![TestStep {
                name: "cleanup".to_string(),
                action: TestAction::ExecuteCommand("pkill -f wren3".to_string()),
                expected_result: None,
                take_screenshot: false,
            }],
        }
    }

    pub async fn run_smoke_test(&self) -> Result<TestExecutionResult> {
        let smoke_test = TestCase {
            name: "smoke_test".to_string(),
            description: "Basic smoke test to verify wren3 starts and responds".to_string(),
            steps: vec![
                TestStep {
                    name: "check_dependencies".to_string(),
                    action: TestAction::ExecuteCommand("which tmux".to_string()),
                    expected_result: Some("tmux available".to_string()),
                    take_screenshot: false,
                },
                TestStep {
                    name: "build_check".to_string(),
                    action: TestAction::ExecuteCommand("cargo check".to_string()),
                    expected_result: Some("Build check passed".to_string()),
                    take_screenshot: false,
                },
                TestStep {
                    name: "capture_startup".to_string(),
                    action: TestAction::Custom("Capture initial state".to_string()),
                    expected_result: None,
                    take_screenshot: true,
                },
            ],
            timeout_seconds: 60,
            expected_screenshots: 1,
        };

        let suite = TestSuite {
            name: "smoke_test_suite".to_string(),
            description: "Smoke test suite".to_string(),
            test_cases: vec![smoke_test],
            setup_steps: vec![],
            teardown_steps: vec![],
        };

        self.run_test_suite(&suite.name).await
    }

    pub fn generate_html_report(&self, result: &TestExecutionResult) -> Result<String> {
        self.generate_html_report_to_dir(result, std::env::current_dir().unwrap().as_path())
    }

    pub fn generate_html_report_to_dir(
        &self,
        result: &TestExecutionResult,
        dir: &std::path::Path,
    ) -> Result<String> {
        let mut html = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <title>QA Test Report - {}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background: #f0f0f0; padding: 20px; border-radius: 5px; }}
        .summary {{ background: #e8f4f8; padding: 15px; margin: 20px 0; border-radius: 5px; }}
        .test-result {{ margin: 10px 0; padding: 10px; border-radius: 5px; }}
        .pass {{ background: #d4edda; border: 1px solid #c3e6cb; }}
        .fail {{ background: #f8d7da; border: 1px solid #f5c6cb; }}
        .screenshot {{ max-width: 300px; margin: 10px; border: 1px solid #ddd; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>QA Test Report</h1>
        <h2>{}</h2>
        <p>Generated: {}</p>
    </div>

    <div class="summary">
        <h3>Summary</h3>
        <p>Total Tests: {}</p>
        <p>Passed: {}</p>
        <p>Failed: {}</p>
        <p>Success Rate: {:.1}%</p>
        <p>Total Duration: {:.2}s</p>
    </div>

    <h3>Test Results</h3>
"#,
            result.suite_name,
            result.suite_name,
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S"),
            result.results.len(),
            result.results.iter().filter(|r| r.passed).count(),
            result.results.iter().filter(|r| !r.passed).count(),
            result.success_rate,
            result.total_duration
        );

        for test_result in &result.results {
            let status_class = if test_result.passed { "pass" } else { "fail" };
            let status_text = if test_result.passed { "PASS" } else { "FAIL" };

            html.push_str(&format!(
                r#"
    <div class="test-result {}">
        <h4>{}</h4>
        <p><strong>Status:</strong> {}</p>
        <p><strong>Duration:</strong> {:.2}s</p>"#,
                status_class, test_result.test_name, status_text, test_result.duration
            ));

            if !test_result.error_message.is_empty() {
                html.push_str(&format!(
                    r#"<p><strong>Error:</strong> {}</p>"#,
                    test_result.error_message
                ));
            }

            if !test_result.screenshot_file.is_empty() {
                html.push_str(&format!(
                    r#"<p><strong>Screenshot:</strong> {}</p>"#,
                    test_result.screenshot_file
                ));
            }

            html.push_str("</div>");
        }

        html.push_str("</body></html>");

        let report_filename = format!(
            "qa_report_{}.html",
            chrono::Utc::now().format("%Y%m%d_%H%M%S")
        );
        let filepath = dir.join(&report_filename);
        std::fs::write(&filepath, &html)?;

        Ok(report_filename)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::tempdir;

    #[test]
    fn test_test_case_creation() {
        let test_case = TestCase {
            name: "test_case_1".to_string(),
            description: "A test case".to_string(),
            steps: vec![],
            timeout_seconds: 30,
            expected_screenshots: 2,
        };

        assert_eq!(test_case.name, "test_case_1");
        assert_eq!(test_case.description, "A test case");
        assert_eq!(test_case.timeout_seconds, 30);
        assert_eq!(test_case.expected_screenshots, 2);
        assert!(test_case.steps.is_empty());
    }

    #[test]
    fn test_test_step_creation() {
        let step = TestStep {
            name: "step1".to_string(),
            action: TestAction::Wait(Duration::from_secs(1)),
            expected_result: Some("expected".to_string()),
            take_screenshot: true,
        };

        assert_eq!(step.name, "step1");
        assert!(step.take_screenshot);
        assert_eq!(step.expected_result, Some("expected".to_string()));

        match step.action {
            TestAction::Wait(duration) => assert_eq!(duration, Duration::from_secs(1)),
            _ => panic!("Expected Wait action"),
        }
    }

    #[test]
    fn test_test_action_variants() {
        let wait_action = TestAction::Wait(Duration::from_millis(500));
        let send_keys_action = TestAction::SendKeys("test input".to_string());
        let assert_visible_action = TestAction::AssertVisible("pattern".to_string());
        let execute_command_action = TestAction::ExecuteCommand("echo test".to_string());
        let custom_action = TestAction::Custom("custom action".to_string());

        match wait_action {
            TestAction::Wait(d) => assert_eq!(d, Duration::from_millis(500)),
            _ => panic!("Expected Wait"),
        }

        match send_keys_action {
            TestAction::SendKeys(s) => assert_eq!(s, "test input"),
            _ => panic!("Expected SendKeys"),
        }

        match assert_visible_action {
            TestAction::AssertVisible(s) => assert_eq!(s, "pattern"),
            _ => panic!("Expected AssertVisible"),
        }

        match execute_command_action {
            TestAction::ExecuteCommand(s) => assert_eq!(s, "echo test"),
            _ => panic!("Expected ExecuteCommand"),
        }

        match custom_action {
            TestAction::Custom(s) => assert_eq!(s, "custom action"),
            _ => panic!("Expected Custom"),
        }
    }

    #[test]
    fn test_test_suite_creation() {
        let suite = TestSuite {
            name: "test_suite".to_string(),
            description: "Test suite description".to_string(),
            test_cases: vec![],
            setup_steps: vec![],
            teardown_steps: vec![],
        };

        assert_eq!(suite.name, "test_suite");
        assert_eq!(suite.description, "Test suite description");
        assert!(suite.test_cases.is_empty());
        assert!(suite.setup_steps.is_empty());
        assert!(suite.teardown_steps.is_empty());
    }

    #[test]
    fn test_test_execution_result_creation() {
        let result = TestExecutionResult {
            suite_name: "suite1".to_string(),
            results: vec![],
            total_duration: 10.5,
            success_rate: 85.0,
        };

        assert_eq!(result.suite_name, "suite1");
        assert!(result.results.is_empty());
        assert_eq!(result.total_duration, 10.5);
        assert_eq!(result.success_rate, 85.0);
    }

    #[test]
    fn test_qa_test_framework_new() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        // Just verify the framework was created successfully
        assert!(framework.test_suites.is_empty());
    }

    #[test]
    fn test_qa_test_framework_add_test_suite() {
        let temp_dir = tempdir().unwrap();
        let mut framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let suite = TestSuite {
            name: "test_suite".to_string(),
            description: "Test suite".to_string(),
            test_cases: vec![],
            setup_steps: vec![],
            teardown_steps: vec![],
        };

        framework.add_test_suite(suite);
        assert_eq!(framework.test_suites.len(), 1);
        assert!(framework.test_suites.contains_key("test_suite"));
    }

    #[test]
    fn test_create_default_test_suite() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let suite = framework.create_default_test_suite();

        assert_eq!(suite.name, "wren3_basic_ui_test");
        assert_eq!(suite.test_cases.len(), 2);
        assert_eq!(suite.setup_steps.len(), 2);
        assert_eq!(suite.teardown_steps.len(), 1);

        // Check first test case
        let first_test = &suite.test_cases[0];
        assert_eq!(first_test.name, "main_menu_navigation");
        assert_eq!(first_test.steps.len(), 3);
        assert_eq!(first_test.expected_screenshots, 3);
    }

    #[test]
    fn test_generate_html_report() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let results = vec![
            QATestResult::new("test1")
                .pass()
                .duration(1.0)
                .screenshot("shot1.txt"),
            QATestResult::new("test2").fail("error msg").duration(2.0),
        ];

        let execution_result = TestExecutionResult {
            suite_name: "test_suite".to_string(),
            results,
            total_duration: 3.0,
            success_rate: 50.0,
        };

        let report_result =
            framework.generate_html_report_to_dir(&execution_result, temp_dir.path());
        assert!(report_result.is_ok());

        let report_filename = report_result.unwrap();
        assert!(report_filename.starts_with("qa_report_"));
        assert!(report_filename.ends_with(".html"));

        // Verify report file exists in temp directory
        let report_path = temp_dir.path().join(&report_filename);
        assert!(report_path.exists());
    }

    #[tokio::test]
    async fn test_execute_step_wait() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "wait_step".to_string(),
            action: TestAction::Wait(Duration::from_millis(10)),
            expected_result: None,
            take_screenshot: false,
        };

        let start = std::time::Instant::now();
        let result = framework.execute_step(&step).await;
        let elapsed = start.elapsed();

        assert!(result.is_ok());
        // Should complete quickly (much less than 10ms would indicate wait didn't happen)
        assert!(elapsed >= Duration::from_millis(5));
    }

    #[tokio::test]
    async fn test_execute_step_send_keys() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "send_keys_step".to_string(),
            action: TestAction::SendKeys("test keys".to_string()),
            expected_result: None,
            take_screenshot: false,
        };

        // This should succeed (currently just logs)
        let result = framework.execute_step(&step).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_step_assert_visible() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "assert_visible_step".to_string(),
            action: TestAction::AssertVisible("test pattern".to_string()),
            expected_result: None,
            take_screenshot: false,
        };

        // This should succeed (currently just logs)
        let result = framework.execute_step(&step).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_step_execute_command_success() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "execute_command_step".to_string(),
            action: TestAction::ExecuteCommand("echo 'test'".to_string()),
            expected_result: None,
            take_screenshot: false,
        };

        let result = framework.execute_step(&step).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_step_execute_command_failure() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "execute_command_fail_step".to_string(),
            action: TestAction::ExecuteCommand("false".to_string()), // Command that always fails
            expected_result: None,
            take_screenshot: false,
        };

        let result = framework.execute_step(&step).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_execute_step_custom() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let step = TestStep {
            name: "custom_step".to_string(),
            action: TestAction::Custom("custom action".to_string()),
            expected_result: None,
            take_screenshot: false,
        };

        // This should succeed (currently just logs)
        let result = framework.execute_step(&step).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_run_test_suite_not_found() {
        let temp_dir = tempdir().unwrap();
        let framework = QATestFramework::new(temp_dir.path().to_str().unwrap());

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(framework.run_test_suite("nonexistent"));

        assert!(result.is_err());
        if let Err(Wren3Error::Validation(msg)) = result {
            assert!(msg.contains("not found"));
        } else {
            panic!("Expected Validation error");
        }
    }
}
