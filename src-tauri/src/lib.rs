// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>
// github.com/nikklasblz/Azu

mod clipboard;
mod commands;
mod pipeline;
mod pty;

use pipeline::PipelineRunner;
use pty::PtyManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyManager::new())
        .manage(PipelineRunner::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pty::create_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::close_pty,
            commands::clipboard::read_clipboard_text,
            commands::clipboard::write_clipboard_text,
            commands::clipboard::read_clipboard_image,
            commands::clipboard::write_clipboard_image,
            commands::clipboard::save_clipboard_image_to_file,
            commands::window::create_window,
            commands::window::minimize_window,
            commands::window::maximize_window,
            commands::window::close_window,
            commands::window::set_always_on_top,
            commands::window::set_window_opacity,
            commands::config::save_config,
            commands::config::load_config,
            commands::dialog::pick_folder,
            commands::env::detect_environment,
            commands::pipeline::pipeline_start,
            commands::pipeline::pipeline_stop,
            commands::pipeline::pipeline_continue,
            commands::pipeline::pipeline_get_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
