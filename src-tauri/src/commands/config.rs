use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn config_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().unwrap_or_else(|_| dirs::home_dir().unwrap().join(".azu"));
    fs::create_dir_all(&dir).ok();
    dir
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() || !key.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid config key".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn save_config(app: AppHandle, key: String, value: String) -> Result<(), String> {
    validate_key(&key)?;
    let dir = config_dir(&app);
    let path = dir.join(format!("{}.json", key));
    // Ensure resolved path is within config dir
    let canonical = path.canonicalize().unwrap_or(path.clone());
    if !canonical.starts_with(&dir) {
        return Err("Invalid config path".to_string());
    }
    fs::write(&path, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle, key: String) -> Result<Option<String>, String> {
    validate_key(&key)?;
    let dir = config_dir(&app);
    let path = dir.join(format!("{}.json", key));
    // Ensure resolved path is within config dir
    let canonical = path.canonicalize().unwrap_or(path.clone());
    if !canonical.starts_with(&dir) {
        return Err("Invalid config path".to_string());
    }
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(Some(data))
    } else {
        Ok(None)
    }
}
