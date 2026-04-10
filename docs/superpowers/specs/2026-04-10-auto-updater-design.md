# Auto-Updater Design

## Overview

Silent background update checker using `tauri-plugin-updater`. Checks GitHub Releases on startup + every 4 hours. Shows a non-intrusive badge in the StatusBar when an update is available. User clicks to download and install.

## Architecture

### 1. Tauri Plugin Layer

- Add `tauri-plugin-updater` to `Cargo.toml`
- Register plugin in `src-tauri/src/lib.rs`
- Configure `updater` in `tauri.conf.json`:
  - Endpoint: GitHub Releases (standard Tauri updater endpoint format)
  - Public key: Ed25519 key embedded in config for signature verification
  - `"installMode": "passive"` (no forced restarts)

### 2. Frontend Update Store (`src/stores/updater.ts`)

Reactive signals:
- `updateAvailable: boolean`
- `updateVersion: string`
- `downloading: boolean`
- `progress: number` (0-100)
- `readyToRestart: boolean`

Functions:
- `checkForUpdate()` — calls Tauri updater API, sets signals
- `downloadAndInstall()` — triggers download with progress, then sets readyToRestart
- `initUpdater()` — runs first check + sets 4-hour interval

### 3. StatusBar Badge

- When update available: `"up v0.2.0"` in accent color, clickeable
- During download: `"up 45%"` with progress
- After install ready: `"Restart to update"` clickeable (triggers app restart)
- No update / checking: nothing shown (invisible)

### 4. Signing

- Generate Ed25519 keypair with `npx @tauri-apps/cli signer generate`
- `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Secrets
- Public key in `tauri.conf.json` updater config
- Release workflow passes signing key env vars to `tauri-action`

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-updater = "2"` |
| `src-tauri/tauri.conf.json` | Add `plugins.updater` config with endpoints + pubkey |
| `src-tauri/src/lib.rs` | Add `.plugin(tauri_plugin_updater::init())` |
| `src/stores/updater.ts` | **New** — check, download, progress signals |
| `src/components/StatusBar/StatusBar.tsx` | Add update badge section |
| `src/App.tsx` | Call `initUpdater()` on mount |
| `.github/workflows/release.yml` | Add `TAURI_SIGNING_PRIVATE_KEY` env to build step |

## Error Handling

- Network failures during check: silently ignore, retry next cycle
- Download failures: show error text briefly in StatusBar, reset state
- No modal dialogs or popups for errors

## Out of Scope

- Settings to disable auto-check
- Release channels (stable/beta)
- Delta updates
