use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn config_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().unwrap_or_else(|_| dirs::home_dir().unwrap().join(".azu"));
    fs::create_dir_all(&dir).ok();
    dir
}

#[tauri::command]
pub fn save_config(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let path = config_dir(&app).join(format!("{}.json", key));
    fs::write(&path, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = config_dir(&app).join(format!("{}.json", key));
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(Some(data))
    } else {
        Ok(None)
    }
}
