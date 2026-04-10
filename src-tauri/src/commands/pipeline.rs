use crate::pipeline::{PipelineRunner, PipelinePane, PipelineState};
use crate::pty::PtyManager;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn pipeline_start(
    app: AppHandle,
    runner: State<'_, PipelineRunner>,
    pty_manager: State<'_, PtyManager>,
    panes: Vec<PipelinePane>,
) -> Result<(), String> {
    runner.start(&app, &panes, &pty_manager)
}

#[tauri::command]
pub fn pipeline_stop(runner: State<'_, PipelineRunner>) -> Result<(), String> {
    runner.stop();
    Ok(())
}

#[tauri::command]
pub fn pipeline_continue(
    app: AppHandle,
    runner: State<'_, PipelineRunner>,
    pty_manager: State<'_, PtyManager>,
) -> Result<(), String> {
    runner.continue_pipeline_from_stored(&app, &pty_manager)
}

#[tauri::command]
pub fn pipeline_get_state(runner: State<'_, PipelineRunner>) -> Result<PipelineState, String> {
    Ok(runner.get_state())
}
