use crate::license::{get_status, remove_license, save_license, validate_key, LicenseStatus};

#[tauri::command]
pub async fn activate_license(key: String) -> Result<LicenseStatus, String> {
    let _info = validate_key(&key)?;
    save_license(&key)?;
    Ok(get_status())
}

#[tauri::command]
pub async fn get_license_status() -> Result<LicenseStatus, String> {
    Ok(get_status())
}

#[tauri::command]
pub async fn deactivate_license() -> Result<(), String> {
    remove_license()
}
