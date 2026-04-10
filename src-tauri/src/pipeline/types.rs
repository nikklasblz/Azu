use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineNodeConfig {
    pub command: String,
    pub prompt: Option<String>,
    pub trigger: String,       // "auto" | "manual"
    pub pipe_mode: String,     // "file" | "text"
    pub order: u32,
    pub timeout: Option<u64>,  // ms
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelinePane {
    pub cell_id: String,
    pub pty_id: String,
    pub cwd: String,
    pub config: PipelineNodeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineState {
    pub status: String,
    pub current_order: u32,
    pub max_order: u32,
    pub started_at: Option<u64>,
    pub pane_states: std::collections::HashMap<String, PaneRunState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneRunState {
    pub status: String,
    pub exit_code: Option<u32>,
    pub started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub captured_output_file: Option<String>,
}

impl PipelineState {
    pub fn new() -> Self {
        Self {
            status: "idle".into(),
            current_order: 0,
            max_order: 0,
            started_at: None,
            pane_states: std::collections::HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_state_new() {
        let state = PipelineState::new();
        assert_eq!(state.status, "idle");
        assert_eq!(state.current_order, 0);
        assert_eq!(state.max_order, 0);
        assert!(state.started_at.is_none());
        assert!(state.pane_states.is_empty());
    }

    #[test]
    fn test_pipeline_node_config_serde() {
        let config = PipelineNodeConfig {
            command: "claude".into(),
            prompt: Some("do something".into()),
            trigger: "auto".into(),
            pipe_mode: "file".into(),
            order: 1,
            timeout: Some(30000),
        };
        let json = serde_json::to_string(&config).unwrap();
        let back: PipelineNodeConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.command, "claude");
        assert_eq!(back.order, 1);
        assert_eq!(back.timeout, Some(30000));
    }

    #[test]
    fn test_pipeline_pane_serde() {
        let pane = PipelinePane {
            cell_id: "cell-1".into(),
            pty_id: "pty-abc".into(),
            cwd: "/home/user".into(),
            config: PipelineNodeConfig {
                command: "claude".into(),
                prompt: None,
                trigger: "manual".into(),
                pipe_mode: "text".into(),
                order: 2,
                timeout: None,
            },
        };
        let json = serde_json::to_string(&pane).unwrap();
        let back: PipelinePane = serde_json::from_str(&json).unwrap();
        assert_eq!(back.cell_id, "cell-1");
        assert_eq!(back.config.order, 2);
        assert!(back.config.timeout.is_none());
    }

    #[test]
    fn test_pane_run_state_serde() {
        let prs = PaneRunState {
            status: "running".into(),
            exit_code: None,
            started_at: Some(1234567890),
            finished_at: None,
            captured_output_file: Some("/tmp/out.txt".into()),
        };
        let json = serde_json::to_string(&prs).unwrap();
        let back: PaneRunState = serde_json::from_str(&json).unwrap();
        assert_eq!(back.status, "running");
        assert!(back.exit_code.is_none());
        assert_eq!(back.started_at, Some(1234567890));
        assert_eq!(back.captured_output_file, Some("/tmp/out.txt".into()));
    }
}
