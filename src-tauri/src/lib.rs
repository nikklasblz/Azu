// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>
// github.com/nikklasblz/Azu

mod clipboard;
mod commands;
mod pipeline;
mod pty;
mod ssh;

use pipeline::PipelineRunner;
use pty::PtyManager;
use ssh::SshManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyManager::new())
        .manage(PipelineRunner::new())
        .manage(SshManager::new())
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
            commands::ssh::ssh_list_hosts,
            commands::ssh::ssh_add_host,
            commands::ssh::ssh_remove_host,
            commands::ssh::ssh_connect,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_write,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_list_connections,
            commands::ssh::sftp_list_dir,
            commands::ssh::sftp_download,
            commands::ssh::sftp_upload,
            commands::ssh::sftp_mkdir,
            commands::ssh::sftp_remove,
            commands::ssh::sftp_rename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
