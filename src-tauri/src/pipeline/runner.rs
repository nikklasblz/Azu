use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use crate::pty::PtyManager;
use super::types::{PaneRunState, PipelinePane, PipelineState};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Minimal shell-escaping: replaces `"` with `\"` so the prompt can be
/// embedded inside a double-quoted shell argument.
fn shell_escape_prompt(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

// ---------------------------------------------------------------------------
// PipelineRunner
// ---------------------------------------------------------------------------

pub struct PipelineRunner {
    state: Arc<Mutex<PipelineState>>,
    /// Panes stored during `start()` so that `continue_pipeline_from_stored`
    /// (called from the Tauri command layer) does not need the frontend to
    /// re-send the full pane list.
    stored_panes: Arc<Mutex<Vec<PipelinePane>>>,
}

impl PipelineRunner {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(PipelineState::new())),
            stored_panes: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Returns a snapshot of the current pipeline state.
    pub fn get_state(&self) -> PipelineState {
        self.state.lock().unwrap().clone()
    }

    /// Marks the pipeline as stopped (idempotent — safe to call at any time).
    pub fn stop(&self) {
        let mut st = self.state.lock().unwrap();
        st.status = "stopped".into();
    }

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    /// Validates a set of panes before starting:
    ///
    /// - Every pane must have `order >= 1`.
    /// - Every pane must have a non-empty `command`.
    /// - Consecutive order groups whose `pipe_mode == "file"` must share the
    ///   same `cwd` so the file written by step N is visible to step N+1.
    pub fn validate(&self, panes: &[PipelinePane]) -> Result<(), String> {
        if panes.is_empty() {
            return Err("Pipeline has no panes".into());
        }

        for p in panes {
            if p.config.order < 1 {
                return Err(format!(
                    "Pane '{}' has order {} — must be >= 1",
                    p.cell_id, p.config.order
                ));
            }
            if p.config.command.trim().is_empty() {
                return Err(format!("Pane '{}' has an empty command", p.cell_id));
            }
        }

        // Collect unique sorted order values.
        let mut orders: Vec<u32> = panes.iter().map(|p| p.config.order).collect();
        orders.sort_unstable();
        orders.dedup();

        // Build a lookup: order -> panes.
        let mut by_order: HashMap<u32, Vec<&PipelinePane>> = HashMap::new();
        for p in panes {
            by_order.entry(p.config.order).or_default().push(p);
        }

        // For each pair of consecutive orders, if both are "file" mode then
        // every pane in the earlier group must share the same cwd as every
        // pane in the later group.
        for window in orders.windows(2) {
            let (ord_a, ord_b) = (window[0], window[1]);
            let group_a = &by_order[&ord_a];
            let group_b = &by_order[&ord_b];

            let all_file_mode = group_a.iter().chain(group_b.iter())
                .all(|p| p.config.pipe_mode == "file");

            if all_file_mode {
                let cwds_a: std::collections::HashSet<&str> =
                    group_a.iter().map(|p| p.cwd.as_str()).collect();
                let cwds_b: std::collections::HashSet<&str> =
                    group_b.iter().map(|p| p.cwd.as_str()).collect();

                // They must share at least one common cwd — but for safety we
                // require *all* cwds across both groups to be identical.
                let union: std::collections::HashSet<&str> =
                    cwds_a.union(&cwds_b).copied().collect();
                if union.len() > 1 {
                    return Err(format!(
                        "File-mode panes in order groups {} and {} have different cwds: {:?}. \
                         Consecutive file-mode steps must share the same working directory.",
                        ord_a, ord_b, union
                    ));
                }
            }
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Start / Continue
    // -----------------------------------------------------------------------

    /// Validates panes, initialises state, then launches order-group 1.
    pub fn start(
        &self,
        app: &AppHandle,
        panes: &[PipelinePane],
        pty_manager: &PtyManager,
    ) -> Result<(), String> {
        self.validate(panes)?;

        // Persist the pane list so that continue_pipeline_from_stored can use
        // it without requiring the frontend to re-send it.
        {
            let mut sp = self.stored_panes.lock().unwrap();
            *sp = panes.to_vec();
        }

        // Compute max order.
        let max_order = panes.iter().map(|p| p.config.order).max().unwrap_or(0);

        {
            let mut st = self.state.lock().unwrap();
            st.status = "running".into();
            st.current_order = 1;
            st.max_order = max_order;
            st.started_at = Some(now_ms());
            st.pane_states = panes
                .iter()
                .map(|p| {
                    (
                        p.cell_id.clone(),
                        PaneRunState {
                            status: "pending".into(),
                            exit_code: None,
                            started_at: None,
                            finished_at: None,
                            captured_output_file: None,
                        },
                    )
                })
                .collect();
        }

        let first_group: Vec<PipelinePane> = panes
            .iter()
            .filter(|p| p.config.order == 1)
            .cloned()
            .collect();

        self.launch_group(app, &first_group, panes, pty_manager)
    }

    /// Advances the pipeline to the next order group (used by manual-trigger
    /// resume).  Called from the Tauri command layer (Task 3) after the
    /// frontend emits a "continue" event.
    pub fn continue_pipeline(
        &self,
        app: &AppHandle,
        panes: &[PipelinePane],
        pty_manager: &PtyManager,
    ) -> Result<(), String> {
        let next_order = {
            let mut st = self.state.lock().unwrap();
            if st.status != "running" && st.status != "waiting" {
                return Err(format!(
                    "Cannot continue — pipeline status is '{}'",
                    st.status
                ));
            }
            st.current_order += 1;
            if st.current_order > st.max_order {
                st.status = "done".into();
                return Ok(());
            }
            st.status = "running".into();
            st.current_order
        };

        let group: Vec<PipelinePane> = panes
            .iter()
            .filter(|p| p.config.order == next_order)
            .cloned()
            .collect();

        if group.is_empty() {
            return Err(format!("No panes found for order {}", next_order));
        }

        self.launch_group(app, &group, panes, pty_manager)
    }

    /// Tauri-command-friendly wrapper: reads the stored pane list from
    /// `start()` rather than requiring the caller to supply it.
    pub fn continue_pipeline_from_stored(
        &self,
        app: &AppHandle,
        pty_manager: &PtyManager,
    ) -> Result<(), String> {
        let panes = self.stored_panes.lock().unwrap().clone();
        if panes.is_empty() {
            return Err("No pipeline has been started — call pipeline_start first".into());
        }
        self.continue_pipeline(app, &panes, pty_manager)
    }

    // -----------------------------------------------------------------------
    // Launch group
    // -----------------------------------------------------------------------

    /// Writes the constructed command to each pane's PTY and emits
    /// `pipeline-step-started` events.
    pub fn launch_group(
        &self,
        app: &AppHandle,
        group: &[PipelinePane],
        all_panes: &[PipelinePane],
        pty_manager: &PtyManager,
    ) -> Result<(), String> {
        for pane in group {
            // Mark this pane as running.
            {
                let mut st = self.state.lock().unwrap();
                if let Some(ps) = st.pane_states.get_mut(&pane.cell_id) {
                    ps.status = "running".into();
                    ps.started_at = Some(now_ms());
                }
            }

            // Build the full prompt and escape it for shell embedding.
            let state_snapshot = self.get_state();
            let prompt = self.build_prompt(pane, all_panes, &state_snapshot);
            let escaped = shell_escape_prompt(&prompt);

            // Construct the full shell command line:  <command> -p "<prompt>"
            // e.g.  claude -p "Step 1/2 ..."
            let command_text = format!("{} -p \"{}\"", pane.config.command.trim(), escaped);

            // Write command text first, then Enter separately with delay
            // (ConPTY on Windows needs this split to process the Enter correctly)
            pty_manager.write(&pane.pty_id, command_text.as_bytes())
                .map_err(|e| format!("Failed to write to PTY '{}': {}", pane.pty_id, e))?;
            std::thread::sleep(std::time::Duration::from_millis(100));
            pty_manager.write(&pane.pty_id, b"\r")
                .map_err(|e| format!("Failed to send Enter to PTY '{}': {}", pane.pty_id, e))?;

            // Emit Tauri event so the frontend can update UI.
            use tauri::Emitter;
            let _ = app.emit(
                "pipeline-step-started",
                serde_json::json!({
                    "cell_id": pane.cell_id,
                    "pty_id":  pane.pty_id,
                    "order":   pane.config.order,
                }),
            );
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Prompt construction
    // -----------------------------------------------------------------------

    /// Builds the full prompt string that will be passed to the agent binary.
    ///
    /// Structure:
    /// ```text
    /// [Step N/M] Project: <cwd>
    ///
    /// Previous step: <description> (exit code <X>)
    /// <file/text context for previous step output>
    ///
    /// Next step preview: <next step command>
    ///
    /// Your task:
    /// <user's prompt>
    ///
    /// When done, exit. Do not ask for confirmation.
    /// ```
    pub fn build_prompt(
        &self,
        pane: &PipelinePane,
        all_panes: &[PipelinePane],
        state: &PipelineState,
    ) -> String {
        let total_steps = {
            let mut orders: Vec<u32> = all_panes.iter().map(|p| p.config.order).collect();
            orders.sort_unstable();
            orders.dedup();
            orders.len() as u32
        };
        let step_n = pane.config.order;

        let mut parts: Vec<String> = Vec::new();

        // Header: step position + project path.
        parts.push(format!(
            "[Step {}/{}] Project: {}",
            step_n, total_steps, pane.cwd
        ));

        // Previous step context.
        if step_n > 1 {
            // Find panes from the immediately preceding order group.
            let prev_order = step_n - 1;
            let prev_panes: Vec<&PipelinePane> = all_panes
                .iter()
                .filter(|p| p.config.order == prev_order)
                .collect();

            if !prev_panes.is_empty() {
                parts.push(String::new()); // blank line
                for prev in &prev_panes {
                    let exit_desc = state
                        .pane_states
                        .get(&prev.cell_id)
                        .and_then(|ps| ps.exit_code)
                        .map(|c| format!(" (exit code {})", c))
                        .unwrap_or_default();

                    parts.push(format!(
                        "Previous step: {} {}{}",
                        prev.config.command,
                        prev.config.prompt.as_deref().unwrap_or(""),
                        exit_desc
                    ));

                    // Pipe-mode context for the previous step's output.
                    match prev.config.pipe_mode.as_str() {
                        "file" => {
                            parts.push(
                                "Files already modified by previous step are in the working directory."
                                    .into(),
                            );
                        }
                        "text" => {
                            // Point to the captured output file if available.
                            let output_file = state
                                .pane_states
                                .get(&prev.cell_id)
                                .and_then(|ps| ps.captured_output_file.as_deref())
                                .unwrap_or("<output not yet available>");
                            parts.push(format!(
                                "Read file {} for previous step output.",
                                output_file
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }

        // Next step preview.
        let next_order = step_n + 1;
        let next_panes: Vec<&PipelinePane> = all_panes
            .iter()
            .filter(|p| p.config.order == next_order)
            .collect();

        if !next_panes.is_empty() {
            parts.push(String::new()); // blank line
            let next_desc: Vec<String> = next_panes
                .iter()
                .map(|p| p.config.command.clone())
                .collect();
            parts.push(format!("Next step preview: {}", next_desc.join(", ")));
        }

        // User's task prompt.
        if let Some(user_prompt) = &pane.config.prompt {
            if !user_prompt.trim().is_empty() {
                parts.push(String::new()); // blank line
                parts.push("Your task:".into());
                parts.push(user_prompt.trim().to_string());
            }
        }

        // Mandatory closing instruction.
        parts.push(String::new()); // blank line
        parts.push("When done, exit. Do not ask for confirmation.".into());

        parts.join("\n")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::types::{PipelineNodeConfig, PipelinePane};

    fn make_pane(cell_id: &str, pty_id: &str, cwd: &str, order: u32, pipe_mode: &str, command: &str, prompt: Option<&str>) -> PipelinePane {
        PipelinePane {
            cell_id: cell_id.into(),
            pty_id: pty_id.into(),
            cwd: cwd.into(),
            config: PipelineNodeConfig {
                command: command.into(),
                prompt: prompt.map(|s| s.into()),
                trigger: "auto".into(),
                pipe_mode: pipe_mode.into(),
                order,
                timeout: None,
            },
        }
    }

    #[test]
    fn test_new_state_is_idle() {
        let runner = PipelineRunner::new();
        let st = runner.get_state();
        assert_eq!(st.status, "idle");
    }

    #[test]
    fn test_stop_sets_status() {
        let runner = PipelineRunner::new();
        runner.stop();
        assert_eq!(runner.get_state().status, "stopped");
    }

    // --- validate ---

    #[test]
    fn test_validate_empty_fails() {
        let runner = PipelineRunner::new();
        assert!(runner.validate(&[]).is_err());
    }

    #[test]
    fn test_validate_order_zero_fails() {
        let runner = PipelineRunner::new();
        let pane = make_pane("c1", "p1", "/tmp", 0, "text", "claude", None);
        let err = runner.validate(&[pane]).unwrap_err();
        assert!(err.contains("order 0"), "error was: {}", err);
    }

    #[test]
    fn test_validate_empty_command_fails() {
        let runner = PipelineRunner::new();
        let pane = make_pane("c1", "p1", "/tmp", 1, "text", "   ", None);
        let err = runner.validate(&[pane]).unwrap_err();
        assert!(err.contains("empty command"), "error was: {}", err);
    }

    #[test]
    fn test_validate_file_mode_different_cwd_fails() {
        let runner = PipelineRunner::new();
        let p1 = make_pane("c1", "p1", "/project/a", 1, "file", "claude", None);
        let p2 = make_pane("c2", "p2", "/project/b", 2, "file", "claude", None);
        let err = runner.validate(&[p1, p2]).unwrap_err();
        assert!(err.contains("different cwds"), "error was: {}", err);
    }

    #[test]
    fn test_validate_file_mode_same_cwd_ok() {
        let runner = PipelineRunner::new();
        let p1 = make_pane("c1", "p1", "/project", 1, "file", "claude", None);
        let p2 = make_pane("c2", "p2", "/project", 2, "file", "claude", None);
        assert!(runner.validate(&[p1, p2]).is_ok());
    }

    #[test]
    fn test_validate_mixed_modes_different_cwd_ok() {
        // Only BOTH-file-mode consecutive groups are constrained.
        let runner = PipelineRunner::new();
        let p1 = make_pane("c1", "p1", "/project/a", 1, "file", "claude", None);
        let p2 = make_pane("c2", "p2", "/project/b", 2, "text", "claude", None);
        assert!(runner.validate(&[p1, p2]).is_ok());
    }

    #[test]
    fn test_validate_valid_pipeline() {
        let runner = PipelineRunner::new();
        let panes = vec![
            make_pane("c1", "p1", "/project", 1, "file", "claude", Some("Step 1 task")),
            make_pane("c2", "p2", "/project", 2, "text", "aider",  Some("Step 2 task")),
        ];
        assert!(runner.validate(&panes).is_ok());
    }

    // --- build_prompt ---

    #[test]
    fn test_build_prompt_step1_contains_header_and_footer() {
        let runner = PipelineRunner::new();
        let pane = make_pane("c1", "p1", "/project", 1, "file", "claude", Some("Fix the bug"));
        let state = PipelineState::new();
        let prompt = runner.build_prompt(&pane, &[pane.clone()], &state);

        assert!(prompt.contains("[Step 1/1]"), "missing step header: {}", prompt);
        assert!(prompt.contains("/project"), "missing cwd: {}", prompt);
        assert!(prompt.contains("Fix the bug"), "missing user prompt: {}", prompt);
        assert!(
            prompt.contains("When done, exit. Do not ask for confirmation."),
            "missing closing instruction: {}",
            prompt
        );
    }

    #[test]
    fn test_build_prompt_step2_has_previous_context() {
        let runner = PipelineRunner::new();
        let panes = vec![
            make_pane("c1", "p1", "/project", 1, "file", "claude", Some("Task 1")),
            make_pane("c2", "p2", "/project", 2, "text", "aider",  Some("Task 2")),
        ];
        let mut state = PipelineState::new();
        state.pane_states.insert("c1".into(), PaneRunState {
            status: "done".into(),
            exit_code: Some(0),
            started_at: None,
            finished_at: None,
            captured_output_file: Some("/tmp/output.txt".into()),
        });

        let prompt = runner.build_prompt(&panes[1], &panes, &state);
        assert!(prompt.contains("Previous step"), "missing previous step: {}", prompt);
        assert!(prompt.contains("exit code 0"), "missing exit code: {}", prompt);
        assert!(prompt.contains("[Step 2/2]"), "missing step 2 header: {}", prompt);
    }

    #[test]
    fn test_build_prompt_file_mode_prev_context() {
        let runner = PipelineRunner::new();
        let panes = vec![
            make_pane("c1", "p1", "/project", 1, "file", "claude", None),
            make_pane("c2", "p2", "/project", 2, "file", "claude", None),
        ];
        let state = PipelineState::new();
        let prompt = runner.build_prompt(&panes[1], &panes, &state);
        assert!(
            prompt.contains("Files already modified by previous step"),
            "missing file-mode context: {}",
            prompt
        );
    }

    #[test]
    fn test_build_prompt_text_mode_prev_context() {
        let runner = PipelineRunner::new();
        let panes = vec![
            make_pane("c1", "p1", "/project", 1, "text", "claude", None),
            make_pane("c2", "p2", "/project", 2, "text", "claude", None),
        ];
        let mut state = PipelineState::new();
        state.pane_states.insert("c1".into(), PaneRunState {
            status: "done".into(),
            exit_code: Some(0),
            started_at: None,
            finished_at: None,
            captured_output_file: Some("/tmp/step1.txt".into()),
        });
        let prompt = runner.build_prompt(&panes[1], &panes, &state);
        assert!(
            prompt.contains("Read file /tmp/step1.txt"),
            "missing text-mode context: {}",
            prompt
        );
    }

    #[test]
    fn test_build_prompt_next_step_preview() {
        let runner = PipelineRunner::new();
        let panes = vec![
            make_pane("c1", "p1", "/project", 1, "text", "claude", None),
            make_pane("c2", "p2", "/project", 2, "text", "aider",  None),
        ];
        let state = PipelineState::new();
        let prompt = runner.build_prompt(&panes[0], &panes, &state);
        assert!(
            prompt.contains("Next step preview"),
            "missing next step preview: {}",
            prompt
        );
        assert!(prompt.contains("aider"), "missing next step command: {}", prompt);
    }

    #[test]
    fn test_shell_escape_prompt_escapes_quotes_and_backslashes() {
        assert_eq!(shell_escape_prompt(r#"say "hello""#), r#"say \"hello\""#);
        assert_eq!(shell_escape_prompt(r"path\to\file"), r"path\\to\\file");
    }
}
