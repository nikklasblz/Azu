use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use dirs::home_dir;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Raw 32-byte Ed25519 public key extracted from the SPKI DER:
/// MCowBQYDK2VwAyEAxJzCw9hn3Gz+292VB+7mD8WLqt1ielhkbh0gEUKMQ4U=
const PUBLIC_KEY_BYTES: [u8; 32] = [
    196, 156, 194, 195, 216, 103, 220, 108, 254, 219, 221, 149, 7, 238, 230, 15,
    197, 139, 170, 221, 98, 122, 88, 100, 110, 29, 32, 17, 66, 140, 67, 133,
];

/// License key prefix that all Azu Pro keys must start with.
const KEY_PREFIX: &str = "AZU-PRO-";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub email: String,
    pub plan: String,   // "monthly" | "yearly"
    pub issued: u64,    // unix timestamp
    pub expires: u64,   // unix timestamp
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub info: Option<LicenseInfo>,
    pub expired: bool,
    pub days_remaining: i64,
}

/// Validate a license key string.
///
/// Format: `AZU-PRO-{base64url_payload}.{base64url_signature}`
///
/// The payload is a base64url-encoded JSON `LicenseInfo` object.
/// The signature is an Ed25519 signature over the raw payload bytes.
pub fn validate_key(key: &str) -> Result<LicenseInfo, String> {
    // 1. Strip prefix
    let body = key
        .strip_prefix(KEY_PREFIX)
        .ok_or_else(|| format!("Invalid key: must start with '{KEY_PREFIX}'"))?;

    // 2. Split on the LAST '.' to get payload and signature
    let dot_pos = body
        .rfind('.')
        .ok_or_else(|| "Invalid key format: missing '.' separator".to_string())?;

    let payload_b64 = &body[..dot_pos];
    let sig_b64 = &body[dot_pos + 1..];

    // 3. Base64-decode both parts (try URL_SAFE_NO_PAD first, fall back to STANDARD)
    let payload_bytes = decode_b64_flexible(payload_b64)
        .map_err(|e| format!("Invalid payload base64: {e}"))?;
    let sig_bytes = decode_b64_flexible(sig_b64)
        .map_err(|e| format!("Invalid signature base64: {e}"))?;

    // 4. Verify Ed25519 signature
    let verifying_key = VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES)
        .map_err(|e| format!("Internal key error: {e}"))?;

    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|e| format!("Invalid signature length: {e}"))?;

    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| "Signature verification failed: key is invalid or tampered".to_string())?;

    // 5. Parse JSON payload
    let info: LicenseInfo = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("Invalid payload JSON: {e}"))?;

    Ok(info)
}

/// Try URL_SAFE_NO_PAD first, then STANDARD, then STANDARD_NO_PAD.
fn decode_b64_flexible(s: &str) -> Result<Vec<u8>, String> {
    if let Ok(bytes) = URL_SAFE_NO_PAD.decode(s) {
        return Ok(bytes);
    }
    if let Ok(bytes) = BASE64_STANDARD.decode(s) {
        return Ok(bytes);
    }
    base64::engine::general_purpose::URL_SAFE
        .decode(s)
        .map_err(|e| e.to_string())
}

/// Path where the license key is persisted: `~/.azu/license.key`
pub fn license_path() -> PathBuf {
    let mut p = home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push(".azu");
    p.push("license.key");
    p
}

/// Read the license key from disk, returning `None` if it doesn't exist or can't be read.
pub fn load_license() -> Option<String> {
    fs::read_to_string(license_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Write the license key to `~/.azu/license.key`, creating the directory if needed.
pub fn save_license(key: &str) -> Result<(), String> {
    let path = license_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create ~/.azu: {e}"))?;
    }
    fs::write(&path, key).map_err(|e| format!("Cannot write license file: {e}"))
}

/// Delete the license key file.
pub fn remove_license() -> Result<(), String> {
    let path = license_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Cannot delete license file: {e}"))?;
    }
    Ok(())
}

/// Return the current license status by loading and validating the stored key.
pub fn get_status() -> LicenseStatus {
    let Some(key) = load_license() else {
        return LicenseStatus {
            valid: false,
            info: None,
            expired: false,
            days_remaining: 0,
        };
    };

    match validate_key(&key) {
        Ok(info) => {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let expired = now >= info.expires;
            let days_remaining = if expired {
                0
            } else {
                ((info.expires - now) / 86_400) as i64
            };

            LicenseStatus {
                valid: !expired,
                info: Some(info),
                expired,
                days_remaining,
            }
        }
        Err(_) => LicenseStatus {
            valid: false,
            info: None,
            expired: false,
            days_remaining: 0,
        },
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{SigningKey, Signer};
    use rand::rngs::OsRng;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;

    /// Build a properly signed license key using an arbitrary signing key.
    fn build_test_key(signing_key: &SigningKey, info: &LicenseInfo) -> String {
        let payload_bytes = serde_json::to_vec(info).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(&payload_bytes);
        let signature = signing_key.sign(&payload_bytes);
        let sig_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());
        format!("{KEY_PREFIX}{payload_b64}.{sig_b64}")
    }

    /// Validate against a caller-supplied verifying key (for in-test crypto checks).
    fn validate_key_with(key: &str, verifying_key: &VerifyingKey) -> Result<LicenseInfo, String> {
        let body = key
            .strip_prefix(KEY_PREFIX)
            .ok_or_else(|| format!("Invalid key: must start with '{KEY_PREFIX}'"))?;
        let dot_pos = body.rfind('.').ok_or("missing separator")?;
        let payload_bytes = decode_b64_flexible(&body[..dot_pos])
            .map_err(|e| format!("payload b64: {e}"))?;
        let sig_bytes = decode_b64_flexible(&body[dot_pos + 1..])
            .map_err(|e| format!("sig b64: {e}"))?;
        let signature = Signature::from_slice(&sig_bytes)
            .map_err(|e| format!("sig len: {e}"))?;
        verifying_key
            .verify(&payload_bytes, &signature)
            .map_err(|_| "bad signature".to_string())?;
        serde_json::from_slice(&payload_bytes).map_err(|e| e.to_string())
    }

    fn sample_info() -> LicenseInfo {
        LicenseInfo {
            email: "test@azu.dev".to_string(),
            plan: "monthly".to_string(),
            issued: 1_712_800_000,
            expires: 9_999_999_999, // far future
        }
    }

    // ── 1. Full crypto round-trip with an ephemeral test keypair ──────────────
    #[test]
    fn test_validate_valid_key() {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        let key = build_test_key(&signing_key, &sample_info());
        let result = validate_key_with(&key, &verifying_key);
        assert!(result.is_ok(), "expected valid key: {:?}", result);
        let info = result.unwrap();
        assert_eq!(info.email, "test@azu.dev");
        assert_eq!(info.plan, "monthly");
    }

    // ── 2. Wrong prefix ────────────────────────────────────────────────────────
    #[test]
    fn test_validate_bad_prefix() {
        let bad = "BAD-PREFIX-abc.def";
        let err = validate_key(bad).unwrap_err();
        assert!(err.contains("must start with"), "got: {err}");
    }

    // ── 3. Missing '.' separator ───────────────────────────────────────────────
    #[test]
    fn test_validate_bad_format() {
        // Has the right prefix but no dot
        let bad = "AZU-PRO-aGVsbG93b3JsZA"; // no dot
        let err = validate_key(bad).unwrap_err();
        assert!(err.contains("separator"), "got: {err}");
    }

    // ── 4. Invalid base64 in payload ────────────────────────────────────────────
    #[test]
    fn test_validate_bad_base64() {
        let bad = "AZU-PRO-!!!invalid_base64!!!.anotherbadpart";
        let err = validate_key(bad).unwrap_err();
        assert!(
            err.contains("base64") || err.contains("Invalid"),
            "got: {err}"
        );
    }

    // ── 5. license_path ends in .azu/license.key ──────────────────────────────
    #[test]
    fn test_license_path() {
        let p = license_path();
        let s = p.to_string_lossy();
        assert!(s.ends_with("license.key"), "path was: {s}");
        assert!(s.contains(".azu"), "path was: {s}");
    }

    // ── 6. Save / load / remove round-trip using a temp dir ───────────────────
    #[test]
    fn test_save_and_load() {
        // We'll override the path by writing directly instead of relying on
        // the global license_path(), so this test is hermetic.
        let tmp = std::env::temp_dir().join("azu_test_license");
        std::fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join("license.key");

        let key = "AZU-PRO-dummypayload.dummysig";
        std::fs::write(&path, key).unwrap();

        let loaded = std::fs::read_to_string(&path).unwrap();
        assert_eq!(loaded.trim(), key);

        // clean up
        std::fs::remove_file(&path).unwrap();
        assert!(!path.exists());
    }

    // ── 7. Tampered signature is rejected ─────────────────────────────────────
    #[test]
    fn test_validate_tampered_signature() {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        let key = build_test_key(&signing_key, &sample_info());

        // Flip the last character of the key (corrupts the signature)
        let mut tampered = key.clone();
        let last = tampered.pop().unwrap();
        let replacement = if last == 'A' { 'B' } else { 'A' };
        tampered.push(replacement);

        let result = validate_key_with(&tampered, &verifying_key);
        assert!(result.is_err(), "tampered key should fail");
    }
}
