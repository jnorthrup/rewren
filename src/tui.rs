use crate::memvid::MemvidBridge;
use crate::query_pipeline::{QueryPipeline, QueryResult};
use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::{Backend, CrosstermBackend},
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame, Terminal,
};
use std::{collections::HashMap, io, time::Duration};

#[derive(Debug, Clone, PartialEq)]
pub enum AppState {
    MainMenu,
    QueryInput,
    ResultsView,
    DocumentView,
}

pub struct App {
    pub state: AppState,
    pub query_input: String,
    pub results: Vec<QueryResult>,
    pub selected_result: usize,
    pub query_pipeline: Option<QueryPipeline>,
    pub memvid_bridge: MemvidBridge,
    pub status_message: String,
    pub is_processing: bool,
    pub providers: HashMap<String, crate::openai::OpenAIClient>,
    pub provider_configs: HashMap<String, crate::config::ProviderConfig>,
    pub provider_list: Vec<String>,
    pub selected_provider_idx: usize,
}

impl App {
    pub fn new(
        query_pipeline: Option<QueryPipeline>,
        memvid_bridge: MemvidBridge,
        providers: HashMap<String, crate::openai::OpenAIClient>,
        provider_configs: HashMap<String, crate::config::ProviderConfig>,
    ) -> Self {
        let provider_list: Vec<String> = providers.keys().cloned().collect();
        let status = if !providers.is_empty() {
            format!("{} providers", providers.len())
        } else {
            "No providers".to_string()
        };

        Self {
            state: AppState::MainMenu,
            query_input: String::new(),
            results: Vec::new(),
            selected_result: 0,
            query_pipeline,
            memvid_bridge,
            providers,
            provider_configs,
            provider_list,
            selected_provider_idx: 0,
            status_message: status,
            is_processing: false,
        }
    }

    pub fn get_selected_provider(&self) -> Option<(&str, &crate::openai::OpenAIClient)> {
        if self.provider_list.is_empty() {
            return None;
        }
        let name = &self.provider_list[self.selected_provider_idx];
        self.providers.get(name.as_str()).map(|client| (name.as_str(), client))
    }

    pub fn next_provider(&mut self) {
        if !self.provider_list.is_empty() {
            self.selected_provider_idx = (self.selected_provider_idx + 1) % self.provider_list.len();
        }
    }

    pub fn previous_provider(&mut self) {
        if !self.provider_list.is_empty() {
            self.selected_provider_idx = if self.selected_provider_idx == 0 {
                self.provider_list.len() - 1
            } else {
                self.selected_provider_idx - 1
            };
        }
    }

    pub fn next_result(&mut self) {
        if !self.results.is_empty() {
            self.selected_result = (self.selected_result + 1) % self.results.len();
        }
    }

    pub fn previous_result(&mut self) {
        if !self.results.is_empty() {
            self.selected_result = if self.selected_result == 0 {
                self.results.len() - 1
            } else {
                self.selected_result - 1
            };
        }
    }

    pub async fn execute_query(&mut self) -> Result<()> {
        let (provider_name, client) = match self.get_selected_provider() {
            Some((name, client)) => (name.to_string(), client.clone()),
            None => {
                self.status_message = "No provider".to_string();
                return Ok(());
            }
        };

        let config = self.provider_configs.get(&provider_name);
        let use_harmony = config.map(|c| c.use_harmony).unwrap_or(false);
        let model = config.map(|c| c.default_model.clone()).unwrap_or_default();

        self.is_processing = true;
        self.status_message = format!("Querying {}", provider_name);

        let content = if use_harmony {
            let resp = client
                .harmony_completion(&model, vec![self.query_input.clone()], Some(4096))
                .await?;
            format!("🧠 REASONING:\n{}\n\n💡 OUTPUT:\n{}", resp.reasoning, resp.output)
        } else {
            let messages = vec![crate::openai::OpenAIMessage {
                role: "user".to_string(),
                content: self.query_input.clone(),
            }];
            client.chat_completion_simple(&model, messages, Some(4096), Some(0.7)).await?
        };

        self.results = vec![QueryResult {
            document_id: provider_name,
            chunk_id: "response".to_string(),
            content,
            similarity_score: 1.0,
            cognitive_load: 0.0,
            vector: vec![],
        }];

        self.is_processing = false;
        self.state = AppState::ResultsView;
        self.selected_result = 0;
        Ok(())
    }
}

pub async fn run_tui(
    query_pipeline: Option<QueryPipeline>,
    memvid_bridge: MemvidBridge,
    providers: HashMap<String, crate::openai::OpenAIClient>,
    provider_configs: HashMap<String, crate::config::ProviderConfig>,
) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let app = App::new(query_pipeline, memvid_bridge, providers, provider_configs);
    let res = run_app(&mut terminal, app).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen, DisableMouseCapture)?;
    terminal.show_cursor()?;

    res
}

async fn run_app<B: Backend>(terminal: &mut Terminal<B>, mut app: App) -> Result<()> {
    loop {
        terminal.draw(|f| ui(f, &mut app))?;

        if crossterm::event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                match app.state {
                    AppState::MainMenu => match key.code {
                        KeyCode::Char('q') => return Ok(()),
                        KeyCode::Char('1') => app.state = AppState::QueryInput,
                        KeyCode::Char('p') | KeyCode::Right => app.next_provider(),
                        KeyCode::Left => app.previous_provider(),
                        _ => {}
                    },
                    AppState::QueryInput => match key.code {
                        KeyCode::Enter => {
                            if !app.query_input.is_empty() {
                                app.execute_query().await?;
                            }
                        }
                        KeyCode::Char(c) => app.query_input.push(c),
                        KeyCode::Backspace => { app.query_input.pop(); }
                        KeyCode::Esc => {
                            app.state = AppState::MainMenu;
                            app.query_input.clear();
                        }
                        _ => {}
                    },
                    AppState::ResultsView => match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => app.state = AppState::MainMenu,
                        KeyCode::Down => app.next_result(),
                        KeyCode::Up => app.previous_result(),
                        KeyCode::Enter => {
                            if !app.results.is_empty() {
                                app.state = AppState::DocumentView;
                            }
                        }
                        _ => {}
                    },
                    AppState::DocumentView => match key.code {
                        KeyCode::Esc | KeyCode::Char('q') => app.state = AppState::ResultsView,
                        _ => {}
                    },
                }
            }
        }
    }
}

fn ui(f: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(1), Constraint::Length(3)])
        .split(f.area());

    let title = Paragraph::new("rewren")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .alignment(Alignment::Center)
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(title, chunks[0]);

    match app.state {
        AppState::MainMenu => draw_main_menu(f, chunks[1], app),
        AppState::QueryInput => draw_query_input(f, chunks[1], app),
        AppState::ResultsView => draw_results_view(f, chunks[1], app),
        AppState::DocumentView => draw_document_view(f, chunks[1], app),
    }

    let status = if app.is_processing {
        Paragraph::new(format!("⏳ {}", app.status_message)).style(Style::default().fg(Color::Yellow))
    } else {
        Paragraph::new(format!("✓ {}", app.status_message)).style(Style::default().fg(Color::Green))
    }.block(Block::default().borders(Borders::ALL));
    f.render_widget(status, chunks[2]);
}

fn draw_main_menu(f: &mut Frame, area: Rect, app: &mut App) {
    let mut menu_items: Vec<String> = vec![
        "1. Query Documents".to_string(),
        "2. Settings".to_string(),
        "3. Test Mode".to_string(),
        "4. Ingest Documents".to_string(),
        "5. Provider Tree".to_string(),  // Add provider tree option
        "".to_string(),
        "q. Quit".to_string(),
    ];

    if app.query_pipeline.is_none() {
        menu_items.insert(0, "⚠️  OFFLINE MODE - Database not available".to_string());
        menu_items.insert(1, "".to_string());
    }

    if app.test_mode {
        menu_items.push("Test Mode: ON (press 't' to toggle)".to_string());
    } else {
        menu_items.push("Test Mode: OFF (press 't' to toggle)".to_string());
    }

    // Show the current selected provider/model and quick action to toggle
    menu_items.push("".to_string());
    menu_items.push(format!("Provider: {} | Model: {} (press 'p' to toggle)", app.provider, app.model));

    let items: Vec<ListItem> = menu_items.iter().map(|item| ListItem::new(item.as_str())).collect();

    let menu = List::new(items)
        .block(Block::default().borders(Borders::ALL).title("Main Menu"))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol(">> ");

    f.render_widget(menu, area);
}

fn draw_query_input(f: &mut Frame, area: Rect, app: &mut App) {
    let input = Paragraph::new(app.query_input.as_str())
        .style(Style::default().fg(Color::Yellow))
        .block(Block::default().borders(Borders::ALL).title("Query"))
        .wrap(Wrap { trim: true });
    f.render_widget(input, area);
}

fn draw_results_view(f: &mut Frame, area: Rect, app: &mut App) {
    let items: Vec<ListItem> = app.results.iter().enumerate().map(|(i, r)| {
        let style = if i == app.selected_result {
            Style::default().fg(Color::Black).bg(Color::White)
        } else {
            Style::default()
        };
        ListItem::new(format!("{}", r.document_id)).style(style)
    }).collect();

    let list = List::new(items).block(Block::default().borders(Borders::ALL).title("Results"));
    f.render_widget(list, area);
}

fn draw_document_view(f: &mut Frame, area: Rect, app: &mut App) {
    if let Some(result) = app.results.get(app.selected_result) {
        let content = Paragraph::new(result.content.as_str())
            .block(Block::default().borders(Borders::ALL).title(result.document_id.as_str()))
            .wrap(Wrap { trim: true });
        f.render_widget(content, area);
    }
}

