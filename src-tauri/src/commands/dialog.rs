#[tauri::command]
pub fn pick_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Select project folder")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}
