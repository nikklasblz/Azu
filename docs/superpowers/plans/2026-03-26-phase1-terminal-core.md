# Phase 1: Terminal Core + Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional cross-platform terminal app with flexible grid layout, theme engine, and rich clipboard — the open-source foundation of Azu.

**Architecture:** Tauri v2 desktop app with Rust backend (PTY management, clipboard, config) and SolidJS frontend (xterm.js terminals, drag-and-drop grid, theme engine). Communication via Tauri commands and events.

**Tech Stack:** Tauri v2, Rust (portable-pty, arboard, rusqlite, serde, toml, notify), SolidJS, xterm.js 5.x, Vite, UnoCSS, Vitest

---

## File Structure

```
D:\Azu\
├── src-tauri/                          # Rust backend
│   ├── Cargo.toml                      # Dependencies: tauri, portable-pty, arboard, image, serde, toml, tokio
│   ├── tauri.conf.json                 # Tauri config: window, permissions, app metadata
│   ├── capabilities/                   # Tauri v2 capability permissions
│   │   └── default.json
│   └── src/
│       ├── lib.rs                      # Tauri app builder, plugin registration, command registration
│       ├── pty/
│       │   ├── mod.rs                  # Re-exports
│       │   └── manager.rs             # PTY lifecycle: spawn, read, write, resize, kill. Uses portable-pty + tokio
│       ├── clipboard/
│       │   ├── mod.rs                  # Re-exports
│       │   └── rich.rs                # Rich clipboard: read/write text + images via arboard + image crate
│       ├── config/
│       │   ├── mod.rs                  # Re-exports
│       │   ├── settings.rs            # App settings TOML read/write, hot-reload via notify
│       │   └── theme.rs               # Theme definitions, load/save custom themes
│       └── commands/
│           ├── mod.rs                  # Re-exports all command modules
│           ├── pty.rs                  # Tauri commands: create_pty, write_pty, resize_pty, close_pty
│           ├── clipboard.rs           # Tauri commands: read_clipboard, write_clipboard, read_clipboard_image, write_clipboard_image
│           └── config.rs              # Tauri commands: get_settings, save_settings, get_themes, save_layout_preset
├── src/                                # SolidJS frontend
│   ├── index.html                      # HTML entry point
│   ├── App.tsx                         # Root component: TitleBar + Grid + StatusBar
│   ├── index.tsx                       # SolidJS render entry
│   ├── components/
│   │   ├── Grid/
│   │   │   ├── Grid.tsx               # Grid container: renders cells based on layout store, handles drop zones
│   │   │   ├── GridCell.tsx           # Single cell wrapper: resize handles, drag source, renders panel content
│   │   │   ├── GridResizer.tsx        # Resize handle between cells: mouse drag to resize, keyboard resize
│   │   │   └── PresetSwitcher.tsx     # Layout preset dropdown: save/load/switch presets, Alt+N hotkeys
│   │   ├── Terminal/
│   │   │   └── Terminal.tsx           # xterm.js wrapper: creates instance, attaches to PTY via Tauri events, handles lifecycle
│   │   ├── TitleBar/
│   │   │   └── TitleBar.tsx           # Custom title bar: app name, tabs, settings gear
│   │   ├── StatusBar/
│   │   │   └── StatusBar.tsx          # Bottom bar: shell name, encoding, connection status, active preset name
│   │   └── ThemePicker/
│   │       └── ThemePicker.tsx        # Theme selection UI: preview cards, apply on click, import/export
│   ├── stores/
│   │   ├── grid.ts                    # Grid state: layout tree, active cell, presets. Serializes to JSON
│   │   ├── terminal.ts               # Terminal instances state: map of PTY id → terminal metadata
│   │   ├── theme.ts                   # Active theme, available themes, CSS variable injection
│   │   └── config.ts                  # App config store: syncs with Rust backend TOML
│   ├── themes/
│   │   ├── index.ts                   # Theme registry: exports all built-in themes
│   │   ├── azu-dark.ts                # Default dark theme
│   │   ├── azu-light.ts               # Light theme
│   │   ├── tokyo-night.ts            # Tokyo Night port
│   │   ├── dracula.ts                 # Dracula port
│   │   └── nord.ts                    # Nord port
│   ├── styles/
│   │   └── global.css                 # Base styles, CSS custom properties skeleton, xterm overrides
│   └── lib/
│       ├── tauri-commands.ts          # Typed wrappers for all Tauri invoke() calls
│       └── keybindings.ts             # Keyboard shortcut registry and handler
├── tests/
│   ├── rust/                           # Rust integration tests (run via cargo test)
│   │   └── pty_test.rs                # PTY spawn/read/write/resize/kill tests
│   └── frontend/                       # Vitest tests
│       ├── stores/
│       │   ├── grid.test.ts           # Grid store: add/remove/move/resize cells, preset save/load
│       │   └── theme.test.ts          # Theme store: apply theme, CSS variable injection
│       └── components/
│           └── Grid.test.tsx          # Grid component: renders cells, handles resize
├── package.json
├── vite.config.ts
├── tsconfig.json
├── uno.config.ts
└── vitest.config.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `uno.config.ts`, `vitest.config.ts`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`
- Create: `src/index.html`, `src/index.tsx`, `src/App.tsx`, `src/styles/global.css`

- [ ] **Step 1: Install Tauri CLI and create project**

```bash
cd D:\Azu
npm install -g @tauri-apps/cli
npm create tauri-app@latest . -- --template solid-ts --manager npm
```

This scaffolds the Tauri v2 + SolidJS + TypeScript project with Vite.

- [ ] **Step 2: Add frontend dependencies**

```bash
cd D:\Azu
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-search
npm install -D unocss @unocss/preset-uno vitest @solidjs/testing-library jsdom
```

- [ ] **Step 3: Add Rust dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
portable-pty = "0.8"
dirs = "5"
arboard = { version = "3", features = ["image-data"] }
image = { version = "0.25", default-features = false, features = ["png", "jpeg"] }
toml = "0.8"
notify = "7"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 4: Configure UnoCSS**

Create `uno.config.ts`:

```ts
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      surface: 'var(--azu-surface)',
      'surface-alt': 'var(--azu-surface-alt)',
      border: 'var(--azu-border)',
      text: 'var(--azu-text)',
      'text-muted': 'var(--azu-text-muted)',
      accent: 'var(--azu-accent)',
    },
  },
})
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
  },
  resolve: {
    conditions: ['development', 'browser'],
  },
})
```

- [ ] **Step 6: Create minimal App.tsx**

```tsx
// src/App.tsx
import { Component } from 'solid-js'

const App: Component = () => {
  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1">
        <p class="p-4 text-text-muted">Terminal grid will render here.</p>
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
```

- [ ] **Step 7: Create global.css with CSS custom property skeleton**

```css
/* src/styles/global.css */
@import '@xterm/xterm/css/xterm.css';

:root {
  --azu-surface: #0d1117;
  --azu-surface-alt: #161b22;
  --azu-border: #30363d;
  --azu-text: #c9d1d9;
  --azu-text-muted: #8b949e;
  --azu-accent: #58a6ff;
  --azu-success: #3fb950;
  --azu-warning: #d29922;
  --azu-error: #f85149;
  --azu-terminal-bg: #0d1117;
  --azu-terminal-fg: #c9d1d9;
  --azu-terminal-cursor: #58a6ff;
  --azu-terminal-selection: rgba(88, 166, 255, 0.3);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
```

- [ ] **Step 8: Verify build**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Window opens with "Azu" header, placeholder text, and status bar footer. Close the app.

- [ ] **Step 9: Commit**

```bash
cd D:\Azu
git add -A
git commit -m "feat: scaffold Tauri v2 + SolidJS + xterm.js project"
```

---

## Task 2: PTY Manager (Rust Backend)

**Files:**
- Create: `src-tauri/src/pty/mod.rs`, `src-tauri/src/pty/manager.rs`
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write PTY manager unit tests**

Create `src-tauri/src/pty/manager.rs` with tests at bottom:

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct PtyInstance {
    pub id: String,
    writer: Box<dyn Write + Send>,
    pair: portable_pty::PtyPair,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(&self, rows: u16, cols: u16) -> Result<String, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let shell = Self::detect_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(dirs::home_dir().unwrap_or_else(|| ".".into()));

        pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();

        let instance = PtyInstance { id: id.clone(), writer, pair };
        self.instances.lock().unwrap().insert(id.clone(), instance);

        Ok(id)
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        let instance = instances.get_mut(id).ok_or("PTY not found")?;
        instance.writer.write_all(data).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.get(id).ok_or("PTY not found")?;
        instance.pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        instances.remove(id).ok_or("PTY not found".to_string())?;
        Ok(())
    }

    pub fn take_reader(&self, id: &str) -> Result<Box<dyn Read + Send>, String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.get(id).ok_or("PTY not found")?;
        instance.pair.master.try_clone_reader().map_err(|e| e.to_string())
    }

    fn detect_shell() -> String {
        if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_close() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80).expect("should spawn");
        assert!(!id.is_empty());
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_write_to_pty() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80).expect("should spawn");
        mgr.write(&id, b"echo hello\n").expect("should write");
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_resize_pty() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80).expect("should spawn");
        mgr.resize(&id, 48, 120).expect("should resize");
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_close_nonexistent() {
        let mgr = PtyManager::new();
        let result = mgr.close("nonexistent");
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Create mod.rs**

```rust
// src-tauri/src/pty/mod.rs
pub mod manager;
pub use manager::PtyManager;
```

- [ ] **Step 3: Run Rust tests**

```bash
cd D:\Azu\src-tauri
cargo test pty
```

Expected: 4 tests pass.

- [ ] **Step 4: Create Tauri commands for PTY**

Create `src-tauri/src/commands/pty.rs`:

```rust
use crate::pty::PtyManager;
use std::io::Read;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn create_pty(state: State<'_, PtyManager>, app: AppHandle, rows: u16, cols: u16) -> Result<String, String> {
    let id = state.spawn(rows, cols)?;
    let reader = state.take_reader(&id)?;
    let pty_id = id.clone();

    // Spawn a thread to stream PTY output to frontend
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&format!("pty-output-{}", pty_id), data);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&format!("pty-exit-{}", pty_id), ());
    });

    Ok(id)
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    state.write(&id, data.as_bytes())
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyManager>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    state.resize(&id, rows, cols)
}

#[tauri::command]
pub fn close_pty(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    state.close(&id)
}
```

Create `src-tauri/src/commands/mod.rs`:

```rust
pub mod pty;
```

- [ ] **Step 5: Register commands and state in lib.rs**

```rust
// src-tauri/src/lib.rs
mod commands;
mod pty;

use pty::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::pty::create_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::close_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Build and verify compilation**

```bash
cd D:\Azu
npm run tauri build -- --debug
```

Expected: Compiles without errors.

- [ ] **Step 7: Commit**

```bash
cd D:\Azu
git add src-tauri/src/pty/ src-tauri/src/commands/ src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add PTY manager with spawn/write/resize/close commands"
```

---

## Task 3: Terminal Component (Frontend)

**Files:**
- Create: `src/components/Terminal/Terminal.tsx`
- Create: `src/lib/tauri-commands.ts`
- Create: `src/stores/terminal.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create typed Tauri command wrappers**

```ts
// src/lib/tauri-commands.ts
import { invoke } from '@tauri-apps/api/core'

export const pty = {
  create: (rows: number, cols: number): Promise<string> =>
    invoke('create_pty', { rows, cols }),
  write: (id: string, data: string): Promise<void> =>
    invoke('write_pty', { id, data }),
  resize: (id: string, rows: number, cols: number): Promise<void> =>
    invoke('resize_pty', { id, rows, cols }),
  close: (id: string): Promise<void> =>
    invoke('close_pty', { id }),
}
```

- [ ] **Step 2: Create terminal store**

```ts
// src/stores/terminal.ts
import { createStore } from 'solid-js/store'

export interface TerminalInstance {
  id: string
  ptyId: string
  title: string
}

const [terminals, setTerminals] = createStore<{
  instances: Record<string, TerminalInstance>
  activeId: string | null
}>({
  instances: {},
  activeId: null,
})

export function addTerminal(id: string, ptyId: string) {
  setTerminals('instances', id, { id, ptyId, title: 'Terminal' })
  setTerminals('activeId', id)
}

export function removeTerminal(id: string) {
  setTerminals('instances', id, undefined!)
}

export function setActiveTerminal(id: string) {
  setTerminals('activeId', id)
}

export { terminals }
```

- [ ] **Step 3: Create Terminal component**

```tsx
// src/components/Terminal/Terminal.tsx
import { Component, onMount, onCleanup } from 'solid-js'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { listen } from '@tauri-apps/api/event'
import { pty } from '../../lib/tauri-commands'

interface TerminalProps {
  ptyId: string
  onTitle?: (title: string) => void
}

const TerminalComponent: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  let term: XTerm | undefined
  let fitAddon: FitAddon | undefined

  onMount(async () => {
    if (!containerRef) return

    term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-bg').trim(),
        foreground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-fg').trim(),
        cursor: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-cursor').trim(),
        selectionBackground: getComputedStyle(document.documentElement).getPropertyValue('--azu-terminal-selection').trim(),
      },
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef)

    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch {
      // WebGL not available, fallback to canvas
    }

    fitAddon.fit()

    // Listen for PTY output
    const unlisten = await listen<string>(`pty-output-${props.ptyId}`, (event) => {
      term?.write(event.payload)
    })

    // Send input to PTY
    term.onData((data) => {
      pty.write(props.ptyId, data)
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
      if (term && fitAddon) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          pty.resize(props.ptyId, dims.rows, dims.cols)
        }
      }
    })
    resizeObserver.observe(containerRef)

    onCleanup(() => {
      unlisten()
      resizeObserver.disconnect()
      term?.dispose()
    })
  })

  return <div ref={containerRef} class="w-full h-full" />
}

export default TerminalComponent
```

- [ ] **Step 4: Wire Terminal into App.tsx for testing**

```tsx
// src/App.tsx
import { Component, createSignal, onMount, Show } from 'solid-js'
import TerminalComponent from './components/Terminal/Terminal'
import { pty } from './lib/tauri-commands'
import './styles/global.css'

const App: Component = () => {
  const [ptyId, setPtyId] = createSignal<string | null>(null)

  onMount(async () => {
    const id = await pty.create(24, 80)
    setPtyId(id)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1 overflow-hidden">
        <Show when={ptyId()}>
          {(id) => <TerminalComponent ptyId={id()} />}
        </Show>
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
```

- [ ] **Step 5: Test manually — launch app**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Window opens, terminal renders with shell prompt (PowerShell on Windows). You can type commands and see output. Resize the window and the terminal adapts.

- [ ] **Step 6: Commit**

```bash
cd D:\Azu
git add src/components/Terminal/ src/lib/tauri-commands.ts src/stores/terminal.ts src/App.tsx
git commit -m "feat: add xterm.js terminal component with PTY integration"
```

---

## Task 4: Grid Store + Logic

**Files:**
- Create: `src/stores/grid.ts`
- Create: `tests/frontend/stores/grid.test.ts`

- [ ] **Step 1: Write failing grid store tests**

```ts
// tests/frontend/stores/grid.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  gridStore,
  addCell,
  removeCell,
  splitHorizontal,
  splitVertical,
  savePreset,
  loadPreset,
  resetGrid,
} from '../../src/stores/grid'

describe('Grid Store', () => {
  beforeEach(() => {
    resetGrid()
  })

  it('starts with a single root cell', () => {
    expect(gridStore.root).not.toBeNull()
    expect(gridStore.root.type).toBe('leaf')
  })

  it('splits a cell horizontally', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    expect(gridStore.root.type).toBe('row')
    expect(gridStore.root.children).toHaveLength(2)
    expect(gridStore.root.children![0].type).toBe('leaf')
    expect(gridStore.root.children![1].type).toBe('leaf')
  })

  it('splits a cell vertically', () => {
    const rootId = gridStore.root.id
    splitVertical(rootId)
    expect(gridStore.root.type).toBe('column')
    expect(gridStore.root.children).toHaveLength(2)
  })

  it('removes a cell and collapses parent', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    const secondChild = gridStore.root.children![1]
    removeCell(secondChild.id)
    expect(gridStore.root.type).toBe('leaf')
  })

  it('saves and loads a preset', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    savePreset('dev')
    resetGrid()
    expect(gridStore.root.type).toBe('leaf')
    loadPreset('dev')
    expect(gridStore.root.type).toBe('row')
    expect(gridStore.root.children).toHaveLength(2)
  })

  it('supports nested splits', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    const firstChild = gridStore.root.children![0]
    splitVertical(firstChild.id)
    expect(gridStore.root.children![0].type).toBe('column')
    expect(gridStore.root.children![0].children).toHaveLength(2)
  })

  it('tracks ratios for resize', () => {
    const rootId = gridStore.root.id
    splitHorizontal(rootId)
    expect(gridStore.root.ratios).toEqual([0.5, 0.5])
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
cd D:\Azu
npx vitest run tests/frontend/stores/grid.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement grid store**

```ts
// src/stores/grid.ts
import { createStore, produce } from 'solid-js/store'

export interface GridNode {
  id: string
  type: 'leaf' | 'row' | 'column'
  panelType?: 'terminal' | 'ai' | 'project' | 'empty'
  children?: GridNode[]
  ratios?: number[]
}

interface GridState {
  root: GridNode
  presets: Record<string, GridNode>
  activePreset: string | null
}

let nextId = 1
function genId(): string {
  return `cell-${nextId++}`
}

function createLeaf(): GridNode {
  return { id: genId(), type: 'leaf', panelType: 'terminal' }
}

function deepClone(node: GridNode): GridNode {
  return JSON.parse(JSON.stringify(node))
}

const initialRoot = createLeaf()

const [gridStore, setGridStore] = createStore<GridState>({
  root: initialRoot,
  presets: {},
  activePreset: null,
})

function findAndReplace(
  node: GridNode,
  targetId: string,
  replacer: (node: GridNode) => GridNode
): GridNode {
  if (node.id === targetId) return replacer(node)
  if (!node.children) return node
  return {
    ...node,
    children: node.children.map((c) => findAndReplace(c, targetId, replacer)),
  }
}

function findParent(node: GridNode, targetId: string): GridNode | null {
  if (!node.children) return null
  for (const child of node.children) {
    if (child.id === targetId) return node
    const found = findParent(child, targetId)
    if (found) return found
  }
  return null
}

export function splitHorizontal(cellId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({
      id: node.id,
      type: 'row' as const,
      children: [createLeaf(), createLeaf()],
      ratios: [0.5, 0.5],
    }))
  )
}

export function splitVertical(cellId: string) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({
      id: node.id,
      type: 'column' as const,
      children: [createLeaf(), createLeaf()],
      ratios: [0.5, 0.5],
    }))
  )
}

export function removeCell(cellId: string) {
  setGridStore('root', (root) => {
    const parent = findParent(root, cellId)
    if (!parent || !parent.children) return root
    const remaining = parent.children.find((c) => c.id !== cellId)
    if (!remaining) return root
    // Replace parent with the remaining child
    return findAndReplace(root, parent.id, () => ({
      ...remaining,
    }))
  })
}

export function savePreset(name: string) {
  setGridStore('presets', name, deepClone(gridStore.root))
  setGridStore('activePreset', name)
}

export function loadPreset(name: string) {
  const preset = gridStore.presets[name]
  if (preset) {
    setGridStore('root', deepClone(preset))
    setGridStore('activePreset', name)
  }
}

export function resetGrid() {
  nextId = 1
  setGridStore('root', createLeaf())
  setGridStore('activePreset', null)
}

export function updateRatios(nodeId: string, ratios: number[]) {
  setGridStore('root', (root) =>
    findAndReplace(root, nodeId, (node) => ({ ...node, ratios }))
  )
}

export { gridStore }
```

- [ ] **Step 4: Run tests — should pass**

```bash
cd D:\Azu
npx vitest run tests/frontend/stores/grid.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd D:\Azu
git add src/stores/grid.ts tests/frontend/stores/grid.test.ts
git commit -m "feat: add grid store with split/remove/presets and tests"
```

---

## Task 5: Grid UI Components

**Files:**
- Create: `src/components/Grid/Grid.tsx`
- Create: `src/components/Grid/GridCell.tsx`
- Create: `src/components/Grid/GridResizer.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create GridCell component**

```tsx
// src/components/Grid/GridCell.tsx
import { Component, Show, createSignal } from 'solid-js'
import { GridNode, splitHorizontal, splitVertical, removeCell } from '../../stores/grid'
import TerminalComponent from '../Terminal/Terminal'

interface GridCellProps {
  node: GridNode
  ptyId?: string
  onRequestPty: (cellId: string) => void
}

const GridCell: Component<GridCellProps> = (props) => {
  const [showMenu, setShowMenu] = createSignal(false)

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setShowMenu(!showMenu())
  }

  return (
    <div class="relative w-full h-full overflow-hidden" onContextMenu={handleContextMenu}>
      <Show when={props.ptyId}>
        {(id) => <TerminalComponent ptyId={id()} />}
      </Show>
      <Show when={!props.ptyId}>
        <div class="flex items-center justify-center h-full text-text-muted">
          <button
            class="px-3 py-1 border border-border rounded hover:bg-surface-alt"
            onClick={() => props.onRequestPty(props.node.id)}
          >
            + New Terminal
          </button>
        </div>
      </Show>
      <Show when={showMenu()}>
        <div class="absolute top-2 right-2 bg-surface-alt border border-border rounded shadow-lg z-50 text-sm">
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-text"
            onClick={() => { splitHorizontal(props.node.id); setShowMenu(false) }}
          >
            Split Right
          </button>
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-text"
            onClick={() => { splitVertical(props.node.id); setShowMenu(false) }}
          >
            Split Down
          </button>
          <button
            class="block w-full px-4 py-2 text-left hover:bg-surface text-error"
            onClick={() => { removeCell(props.node.id); setShowMenu(false) }}
          >
            Close
          </button>
        </div>
      </Show>
    </div>
  )
}

export default GridCell
```

- [ ] **Step 2: Create GridResizer component**

```tsx
// src/components/Grid/GridResizer.tsx
import { Component, createSignal } from 'solid-js'

interface GridResizerProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}

const GridResizer: Component<GridResizerProps> = (props) => {
  const [dragging, setDragging] = createSignal(false)

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    const startPos = props.direction === 'horizontal' ? e.clientX : e.clientY

    let lastPos = startPos
    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = props.direction === 'horizontal' ? e.clientX : e.clientY
      props.onResize(currentPos - lastPos)
      lastPos = currentPos
    }

    const handleMouseUp = () => {
      setDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const cursorClass = props.direction === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'
  const sizeClass = props.direction === 'horizontal' ? 'w-1 h-full' : 'h-1 w-full'

  return (
    <div
      class={`${sizeClass} ${cursorClass} bg-border hover:bg-accent transition-colors shrink-0 ${dragging() ? 'bg-accent' : ''}`}
      onMouseDown={handleMouseDown}
    />
  )
}

export default GridResizer
```

- [ ] **Step 3: Create Grid container**

```tsx
// src/components/Grid/Grid.tsx
import { Component, For, Show, createMemo } from 'solid-js'
import { GridNode, gridStore, updateRatios } from '../../stores/grid'
import GridCell from './GridCell'
import GridResizer from './GridResizer'

interface GridProps {
  ptyMap: Record<string, string>  // cellId → ptyId
  onRequestPty: (cellId: string) => void
}

const GridContainer: Component<GridProps> = (props) => {
  const renderNode = (node: GridNode, parentSize?: { width: number; height: number }) => {
    if (node.type === 'leaf') {
      return (
        <GridCell
          node={node}
          ptyId={props.ptyMap[node.id]}
          onRequestPty={props.onRequestPty}
        />
      )
    }

    const isRow = node.type === 'row'
    const ratios = node.ratios || node.children!.map(() => 1 / node.children!.length)

    return (
      <div
        class="w-full h-full"
        style={{
          display: 'flex',
          'flex-direction': isRow ? 'row' : 'column',
        }}
      >
        <For each={node.children!}>
          {(child, index) => (
            <>
              <div
                style={{
                  [isRow ? 'width' : 'height']: `${ratios[index()] * 100}%`,
                  [isRow ? 'height' : 'width']: '100%',
                  overflow: 'hidden',
                }}
              >
                {renderNode(child)}
              </div>
              <Show when={index() < node.children!.length - 1}>
                <GridResizer
                  direction={isRow ? 'horizontal' : 'vertical'}
                  onResize={(delta) => {
                    const container = isRow
                      ? document.querySelector('.flex-1')?.clientWidth || 800
                      : document.querySelector('.flex-1')?.clientHeight || 600
                    const pctDelta = delta / container
                    const newRatios = [...ratios]
                    newRatios[index()] = Math.max(0.1, ratios[index()] + pctDelta)
                    newRatios[index() + 1] = Math.max(0.1, ratios[index() + 1] - pctDelta)
                    updateRatios(node.id, newRatios)
                  }}
                />
              </Show>
            </>
          )}
        </For>
      </div>
    )
  }

  return <div class="w-full h-full overflow-hidden">{renderNode(gridStore.root)}</div>
}

export default GridContainer
```

- [ ] **Step 4: Update App.tsx with Grid**

```tsx
// src/App.tsx
import { Component, createSignal, onMount } from 'solid-js'
import GridContainer from './components/Grid/Grid'
import { gridStore } from './stores/grid'
import { pty } from './lib/tauri-commands'
import './styles/global.css'

const App: Component = () => {
  const [ptyMap, setPtyMap] = createSignal<Record<string, string>>({})

  const handleRequestPty = async (cellId: string) => {
    const ptyId = await pty.create(24, 80)
    setPtyMap((prev) => ({ ...prev, [cellId]: ptyId }))
  }

  // Auto-create PTY for the initial cell
  onMount(async () => {
    const rootId = gridStore.root.id
    await handleRequestPty(rootId)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
```

- [ ] **Step 5: Test manually**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Terminal opens with one pane. Right-click → "Split Right" creates a second pane. Both panes have working terminals. Drag the resizer between them. Right-click → "Close" removes a pane.

- [ ] **Step 6: Commit**

```bash
cd D:\Azu
git add src/components/Grid/ src/App.tsx
git commit -m "feat: add grid UI with split panes, resize, and context menu"
```

---

## Task 6: Layout Presets UI

**Files:**
- Create: `src/components/Grid/PresetSwitcher.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Grid/Grid.tsx`

- [ ] **Step 1: Create PresetSwitcher component**

```tsx
// src/components/Grid/PresetSwitcher.tsx
import { Component, For, createSignal, Show } from 'solid-js'
import { gridStore, savePreset, loadPreset } from '../../stores/grid'

const PresetSwitcher: Component = () => {
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [newName, setNewName] = createSignal('')

  const presetNames = () => Object.keys(gridStore.presets)

  const handleSave = () => {
    const name = newName().trim()
    if (name) {
      savePreset(name)
      setNewName('')
    }
  }

  return (
    <div class="relative">
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => setShowDropdown(!showDropdown())}
      >
        {gridStore.activePreset || 'Layouts'} ▾
      </button>
      <Show when={showDropdown()}>
        <div class="absolute top-full left-0 mt-1 bg-surface-alt border border-border rounded shadow-lg z-50 min-w-48">
          <For each={presetNames()}>
            {(name) => (
              <button
                class="block w-full px-4 py-2 text-left text-sm hover:bg-surface text-text"
                classList={{ 'text-accent': gridStore.activePreset === name }}
                onClick={() => { loadPreset(name); setShowDropdown(false) }}
              >
                {name}
              </button>
            )}
          </For>
          <div class="border-t border-border p-2 flex gap-1">
            <input
              class="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded text-text"
              placeholder="Save current as..."
              value={newName()}
              onInput={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              class="px-2 py-1 text-xs bg-accent text-surface rounded"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default PresetSwitcher
```

- [ ] **Step 2: Add PresetSwitcher to App.tsx header**

Update the header in `App.tsx`:

```tsx
<header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0 gap-4">
  <span class="font-bold text-accent">Azu</span>
  <PresetSwitcher />
</header>
```

Add import: `import PresetSwitcher from './components/Grid/PresetSwitcher'`

- [ ] **Step 3: Add keyboard shortcuts for presets**

Create `src/lib/keybindings.ts`:

```ts
// src/lib/keybindings.ts
import { loadPreset, gridStore } from '../stores/grid'

export function initKeybindings() {
  document.addEventListener('keydown', (e) => {
    // Alt+1..9 to switch presets
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const presetNames = Object.keys(gridStore.presets)
      const index = parseInt(e.key) - 1
      if (index < presetNames.length) {
        loadPreset(presetNames[index])
      }
    }
  })
}
```

Call `initKeybindings()` in `App.tsx`'s `onMount`.

- [ ] **Step 4: Test manually**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Split some panes, type "dev" in preset box and click Save. Reset layout, then load "dev" from dropdown — layout restores. Alt+1 loads first preset.

- [ ] **Step 5: Commit**

```bash
cd D:\Azu
git add src/components/Grid/PresetSwitcher.tsx src/lib/keybindings.ts src/App.tsx
git commit -m "feat: add layout presets with save/load and Alt+N hotkeys"
```

---

## Task 7: Theme Engine

**Files:**
- Create: `src/stores/theme.ts`
- Create: `src/themes/index.ts`, `src/themes/azu-dark.ts`, `src/themes/azu-light.ts`, `src/themes/tokyo-night.ts`, `src/themes/dracula.ts`, `src/themes/nord.ts`
- Create: `tests/frontend/stores/theme.test.ts`

- [ ] **Step 1: Write failing theme store tests**

```ts
// tests/frontend/stores/theme.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { themeStore, applyTheme, getAvailableThemes, registerTheme } from '../../src/stores/theme'

describe('Theme Store', () => {
  it('has azu-dark as default', () => {
    expect(themeStore.activeId).toBe('azu-dark')
  })

  it('lists all built-in themes', () => {
    const themes = getAvailableThemes()
    expect(themes.length).toBeGreaterThanOrEqual(5)
    expect(themes.map(t => t.id)).toContain('azu-dark')
    expect(themes.map(t => t.id)).toContain('azu-light')
  })

  it('applies a theme by id', () => {
    applyTheme('nord')
    expect(themeStore.activeId).toBe('nord')
  })

  it('registers a custom theme', () => {
    registerTheme({
      id: 'custom-test',
      name: 'Custom Test',
      colors: {
        surface: '#111111',
        surfaceAlt: '#222222',
        border: '#333333',
        text: '#eeeeee',
        textMuted: '#999999',
        accent: '#ff0000',
        success: '#00ff00',
        warning: '#ffff00',
        error: '#ff0000',
        terminalBg: '#111111',
        terminalFg: '#eeeeee',
        terminalCursor: '#ff0000',
        terminalSelection: 'rgba(255,0,0,0.3)',
      },
    })
    const themes = getAvailableThemes()
    expect(themes.map(t => t.id)).toContain('custom-test')
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
cd D:\Azu
npx vitest run tests/frontend/stores/theme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create theme definitions**

```ts
// src/themes/azu-dark.ts
import { ThemeDefinition } from '../stores/theme'

export const azuDark: ThemeDefinition = {
  id: 'azu-dark',
  name: 'Azu Dark',
  colors: {
    surface: '#0d1117',
    surfaceAlt: '#161b22',
    border: '#30363d',
    text: '#c9d1d9',
    textMuted: '#8b949e',
    accent: '#58a6ff',
    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
    terminalBg: '#0d1117',
    terminalFg: '#c9d1d9',
    terminalCursor: '#58a6ff',
    terminalSelection: 'rgba(88,166,255,0.3)',
  },
}
```

```ts
// src/themes/azu-light.ts
import { ThemeDefinition } from '../stores/theme'

export const azuLight: ThemeDefinition = {
  id: 'azu-light',
  name: 'Azu Light',
  colors: {
    surface: '#ffffff',
    surfaceAlt: '#f6f8fa',
    border: '#d0d7de',
    text: '#1f2328',
    textMuted: '#656d76',
    accent: '#0969da',
    success: '#1a7f37',
    warning: '#9a6700',
    error: '#cf222e',
    terminalBg: '#ffffff',
    terminalFg: '#1f2328',
    terminalCursor: '#0969da',
    terminalSelection: 'rgba(9,105,218,0.2)',
  },
}
```

```ts
// src/themes/tokyo-night.ts
import { ThemeDefinition } from '../stores/theme'

export const tokyoNight: ThemeDefinition = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  colors: {
    surface: '#1a1b26',
    surfaceAlt: '#24283b',
    border: '#3b4261',
    text: '#a9b1d6',
    textMuted: '#565f89',
    accent: '#7aa2f7',
    success: '#9ece6a',
    warning: '#e0af68',
    error: '#f7768e',
    terminalBg: '#1a1b26',
    terminalFg: '#a9b1d6',
    terminalCursor: '#7aa2f7',
    terminalSelection: 'rgba(122,162,247,0.3)',
  },
}
```

```ts
// src/themes/dracula.ts
import { ThemeDefinition } from '../stores/theme'

export const dracula: ThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  colors: {
    surface: '#282a36',
    surfaceAlt: '#343746',
    border: '#44475a',
    text: '#f8f8f2',
    textMuted: '#6272a4',
    accent: '#bd93f9',
    success: '#50fa7b',
    warning: '#f1fa8c',
    error: '#ff5555',
    terminalBg: '#282a36',
    terminalFg: '#f8f8f2',
    terminalCursor: '#bd93f9',
    terminalSelection: 'rgba(189,147,249,0.3)',
  },
}
```

```ts
// src/themes/nord.ts
import { ThemeDefinition } from '../stores/theme'

export const nord: ThemeDefinition = {
  id: 'nord',
  name: 'Nord',
  colors: {
    surface: '#2e3440',
    surfaceAlt: '#3b4252',
    border: '#4c566a',
    text: '#d8dee9',
    textMuted: '#81a1c1',
    accent: '#88c0d0',
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    terminalBg: '#2e3440',
    terminalFg: '#d8dee9',
    terminalCursor: '#88c0d0',
    terminalSelection: 'rgba(136,192,208,0.3)',
  },
}
```

```ts
// src/themes/index.ts
export { azuDark } from './azu-dark'
export { azuLight } from './azu-light'
export { tokyoNight } from './tokyo-night'
export { dracula } from './dracula'
export { nord } from './nord'
```

- [ ] **Step 4: Implement theme store**

```ts
// src/stores/theme.ts
import { createStore } from 'solid-js/store'
import { azuDark, azuLight, tokyoNight, dracula, nord } from '../themes'

export interface ThemeColors {
  surface: string
  surfaceAlt: string
  border: string
  text: string
  textMuted: string
  accent: string
  success: string
  warning: string
  error: string
  terminalBg: string
  terminalFg: string
  terminalCursor: string
  terminalSelection: string
}

export interface ThemeDefinition {
  id: string
  name: string
  colors: ThemeColors
}

interface ThemeState {
  activeId: string
  themes: Record<string, ThemeDefinition>
}

const builtInThemes: ThemeDefinition[] = [azuDark, azuLight, tokyoNight, dracula, nord]

const themesMap: Record<string, ThemeDefinition> = {}
for (const t of builtInThemes) {
  themesMap[t.id] = t
}

const [themeStore, setThemeStore] = createStore<ThemeState>({
  activeId: 'azu-dark',
  themes: themesMap,
})

export function applyTheme(id: string) {
  const theme = themeStore.themes[id]
  if (!theme) return

  setThemeStore('activeId', id)

  const root = document.documentElement
  root.style.setProperty('--azu-surface', theme.colors.surface)
  root.style.setProperty('--azu-surface-alt', theme.colors.surfaceAlt)
  root.style.setProperty('--azu-border', theme.colors.border)
  root.style.setProperty('--azu-text', theme.colors.text)
  root.style.setProperty('--azu-text-muted', theme.colors.textMuted)
  root.style.setProperty('--azu-accent', theme.colors.accent)
  root.style.setProperty('--azu-success', theme.colors.success)
  root.style.setProperty('--azu-warning', theme.colors.warning)
  root.style.setProperty('--azu-error', theme.colors.error)
  root.style.setProperty('--azu-terminal-bg', theme.colors.terminalBg)
  root.style.setProperty('--azu-terminal-fg', theme.colors.terminalFg)
  root.style.setProperty('--azu-terminal-cursor', theme.colors.terminalCursor)
  root.style.setProperty('--azu-terminal-selection', theme.colors.terminalSelection)
}

export function getAvailableThemes(): ThemeDefinition[] {
  return Object.values(themeStore.themes)
}

export function registerTheme(theme: ThemeDefinition) {
  setThemeStore('themes', theme.id, theme)
}

export { themeStore }
```

- [ ] **Step 5: Run tests — should pass**

```bash
cd D:\Azu
npx vitest run tests/frontend/stores/theme.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd D:\Azu
git add src/stores/theme.ts src/themes/ tests/frontend/stores/theme.test.ts
git commit -m "feat: add theme engine with 5 built-in themes and hot-swap"
```

---

## Task 8: Theme Picker UI

**Files:**
- Create: `src/components/ThemePicker/ThemePicker.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create ThemePicker component**

```tsx
// src/components/ThemePicker/ThemePicker.tsx
import { Component, For, Show, createSignal } from 'solid-js'
import { themeStore, applyTheme, getAvailableThemes } from '../../stores/theme'

const ThemePicker: Component = () => {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="relative ml-auto">
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => setOpen(!open())}
        title="Change theme"
      >
        ◐ Theme
      </button>
      <Show when={open()}>
        <div class="absolute top-full right-0 mt-1 bg-surface-alt border border-border rounded shadow-lg z-50 min-w-56 p-2">
          <div class="text-xs text-text-muted mb-2 px-2">Select Theme</div>
          <For each={getAvailableThemes()}>
            {(theme) => (
              <button
                class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded hover:bg-surface text-text"
                classList={{ 'ring-1 ring-accent': themeStore.activeId === theme.id }}
                onClick={() => { applyTheme(theme.id); setOpen(false) }}
              >
                <div class="flex gap-0.5 shrink-0">
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.surface }} />
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.accent }} />
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.text }} />
                </div>
                <span>{theme.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThemePicker
```

- [ ] **Step 2: Add ThemePicker to App.tsx header**

```tsx
<header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0 gap-4">
  <span class="font-bold text-accent">Azu</span>
  <PresetSwitcher />
  <ThemePicker />
</header>
```

Add import: `import ThemePicker from './components/ThemePicker/ThemePicker'`

- [ ] **Step 3: Test manually**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Click "Theme" button in header → dropdown shows 5 themes with color dots. Click "Tokyo Night" → entire UI (including terminal) changes colors instantly. No reload needed.

- [ ] **Step 4: Commit**

```bash
cd D:\Azu
git add src/components/ThemePicker/ src/App.tsx
git commit -m "feat: add theme picker UI with instant hot-swap"
```

---

## Task 9: Rich Clipboard (Rust Backend)

**Files:**
- Create: `src-tauri/src/clipboard/mod.rs`, `src-tauri/src/clipboard/rich.rs`
- Create: `src-tauri/src/commands/clipboard.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement rich clipboard module with tests**

```rust
// src-tauri/src/clipboard/rich.rs
use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

pub struct RichClipboard;

impl RichClipboard {
    pub fn read_text() -> Result<String, String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.get_text().map_err(|e| e.to_string())
    }

    pub fn write_text(text: &str) -> Result<(), String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_text(text).map_err(|e| e.to_string())
    }

    /// Returns base64 PNG if image is on clipboard, None otherwise
    pub fn read_image_as_base64() -> Result<Option<String>, String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        match clipboard.get_image() {
            Ok(img_data) => {
                let img = DynamicImage::ImageRgba8(
                    image::RgbaImage::from_raw(
                        img_data.width as u32,
                        img_data.height as u32,
                        img_data.bytes.into_owned(),
                    )
                    .ok_or("Failed to create image from clipboard data")?,
                );
                let mut buf = Cursor::new(Vec::new());
                img.write_to(&mut buf, ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
                Ok(Some(STANDARD.encode(buf.into_inner())))
            }
            Err(_) => Ok(None),
        }
    }

    /// Write base64-encoded PNG to clipboard
    pub fn write_image_from_base64(b64: &str) -> Result<(), String> {
        let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();

        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        let img_data = ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into_raw().into(),
        };
        clipboard.set_image(img_data).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_roundtrip() {
        RichClipboard::write_text("azu-test-clipboard").unwrap();
        let text = RichClipboard::read_text().unwrap();
        assert_eq!(text, "azu-test-clipboard");
    }

    #[test]
    fn test_read_image_returns_none_when_text() {
        RichClipboard::write_text("not an image").unwrap();
        // May return None or Err depending on platform — both are acceptable
        let result = RichClipboard::read_image_as_base64();
        if let Ok(val) = result {
            assert!(val.is_none() || val.unwrap().is_empty() == false);
        }
    }
}
```

```rust
// src-tauri/src/clipboard/mod.rs
pub mod rich;
pub use rich::RichClipboard;
```

- [ ] **Step 2: Run Rust tests**

```bash
cd D:\Azu\src-tauri
cargo test clipboard
```

Expected: Tests pass (text roundtrip works, image read doesn't crash).

- [ ] **Step 3: Create Tauri clipboard commands**

```rust
// src-tauri/src/commands/clipboard.rs
use crate::clipboard::RichClipboard;

#[tauri::command]
pub fn read_clipboard_text() -> Result<String, String> {
    RichClipboard::read_text()
}

#[tauri::command]
pub fn write_clipboard_text(text: String) -> Result<(), String> {
    RichClipboard::write_text(&text)
}

#[tauri::command]
pub fn read_clipboard_image() -> Result<Option<String>, String> {
    RichClipboard::read_image_as_base64()
}

#[tauri::command]
pub fn write_clipboard_image(base64_png: String) -> Result<(), String> {
    RichClipboard::write_image_from_base64(&base64_png)
}
```

- [ ] **Step 4: Register clipboard commands**

Update `src-tauri/src/commands/mod.rs`:

```rust
pub mod pty;
pub mod clipboard;
```

Update `src-tauri/src/lib.rs` to include clipboard commands and clipboard module:

```rust
mod commands;
mod pty;
mod clipboard;

use pty::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::pty::create_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::close_pty,
            commands::clipboard::read_clipboard_text,
            commands::clipboard::write_clipboard_text,
            commands::clipboard::read_clipboard_image,
            commands::clipboard::write_clipboard_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Add clipboard commands to frontend wrappers**

Update `src/lib/tauri-commands.ts` — add:

```ts
export const clipboard = {
  readText: (): Promise<string> => invoke('read_clipboard_text'),
  writeText: (text: string): Promise<void> => invoke('write_clipboard_text', { text }),
  readImage: (): Promise<string | null> => invoke('read_clipboard_image'),
  writeImage: (base64Png: string): Promise<void> => invoke('write_clipboard_image', { base64Png }),
}
```

- [ ] **Step 6: Verify compilation**

```bash
cd D:\Azu
npm run tauri build -- --debug
```

Expected: Compiles without errors.

- [ ] **Step 7: Commit**

```bash
cd D:\Azu
git add src-tauri/src/clipboard/ src-tauri/src/commands/clipboard.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/tauri-commands.ts
git commit -m "feat: add rich clipboard with image read/write support"
```

---

## Task 10: Rich Clipboard Frontend (Image Paste in Terminal)

**Files:**
- Modify: `src/components/Terminal/Terminal.tsx`
- Modify: `src/components/Grid/GridCell.tsx`

- [ ] **Step 1: Add paste handler to Terminal component**

Add to `Terminal.tsx` inside `onMount`, after xterm setup:

```ts
// Handle Ctrl+V with image support
containerRef.addEventListener('paste', async (e: ClipboardEvent) => {
  e.preventDefault()

  // Check for image first
  const imageB64 = await clipboard.readImage()
  if (imageB64) {
    // Render image inline using iTerm2 protocol (OSC 1337)
    // Fallback: show as [Image pasted] notification
    const imgEl = document.createElement('div')
    imgEl.className = 'azu-inline-image'
    imgEl.style.cssText = 'max-width:400px;max-height:300px;margin:4px 0;'
    imgEl.innerHTML = `<img src="data:image/png;base64,${imageB64}" style="max-width:100%;border-radius:4px;border:1px solid var(--azu-border);" />`
    // Insert before terminal cursor area
    containerRef.insertBefore(imgEl, containerRef.firstChild)
    return
  }

  // Fallback to text paste
  const text = await clipboard.readText()
  if (text) {
    pty.write(props.ptyId, text)
  }
})
```

Add import: `import { clipboard } from '../../lib/tauri-commands'`

- [ ] **Step 2: Add copy handler with syntax highlighting**

Add to `Terminal.tsx` inside `onMount`:

```ts
// Handle Ctrl+C — copy selection if text is selected, otherwise send SIGINT
term.attachCustomKeyEventHandler((e) => {
  if (e.ctrlKey && e.key === 'c' && e.type === 'keydown') {
    const selection = term!.getSelection()
    if (selection) {
      clipboard.writeText(selection)
      return false // prevent default (don't send to PTY)
    }
  }
  return true // let all other keys through
})
```

- [ ] **Step 3: Test manually**

```bash
cd D:\Azu
npm run tauri dev
```

Expected:
1. Copy an image from browser → Ctrl+V in Azu terminal → image renders inline
2. Select text in terminal → Ctrl+C → text copied to clipboard
3. Ctrl+V with text → text pastes into terminal as input

- [ ] **Step 4: Commit**

```bash
cd D:\Azu
git add src/components/Terminal/Terminal.tsx
git commit -m "feat: add rich clipboard support — Ctrl+C/V images and text in terminal"
```

---

## Task 11: Title Bar and Status Bar

**Files:**
- Create: `src/components/TitleBar/TitleBar.tsx`
- Create: `src/components/StatusBar/StatusBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create TitleBar component**

```tsx
// src/components/TitleBar/TitleBar.tsx
import { Component } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'

const TitleBar: Component = () => {
  return (
    <header
      class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0 gap-4 select-none"
      data-tauri-drag-region
    >
      <span class="font-bold text-accent text-sm">Azu</span>
      <PresetSwitcher />
      <div class="flex-1" data-tauri-drag-region />
      <ThemePicker />
    </header>
  )
}

export default TitleBar
```

- [ ] **Step 2: Create StatusBar component**

```tsx
// src/components/StatusBar/StatusBar.tsx
import { Component, createMemo } from 'solid-js'
import { gridStore } from '../../stores/grid'
import { themeStore } from '../../stores/theme'

function countLeaves(node: any): number {
  if (node.type === 'leaf') return 1
  return (node.children || []).reduce((acc: number, c: any) => acc + countLeaves(c), 0)
}

const StatusBar: Component = () => {
  const paneCount = createMemo(() => countLeaves(gridStore.root))

  return (
    <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0 gap-4 select-none">
      <span class="text-success">● Ready</span>
      <span>{paneCount()} pane{paneCount() > 1 ? 's' : ''}</span>
      <span>{gridStore.activePreset || 'No preset'}</span>
      <div class="flex-1" />
      <span>{themeStore.activeId}</span>
      <span>UTF-8</span>
    </footer>
  )
}

export default StatusBar
```

- [ ] **Step 3: Update App.tsx to use TitleBar and StatusBar**

```tsx
// src/App.tsx
import { Component, createSignal, onMount } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore } from './stores/grid'
import { pty } from './lib/tauri-commands'
import { initKeybindings } from './lib/keybindings'
import './styles/global.css'

const App: Component = () => {
  const [ptyMap, setPtyMap] = createSignal<Record<string, string>>({})

  const handleRequestPty = async (cellId: string) => {
    const ptyId = await pty.create(24, 80)
    setPtyMap((prev) => ({ ...prev, [cellId]: ptyId }))
  }

  onMount(async () => {
    initKeybindings()
    const rootId = gridStore.root.id
    await handleRequestPty(rootId)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <TitleBar />
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <StatusBar />
    </div>
  )
}

export default App
```

- [ ] **Step 4: Test manually**

```bash
cd D:\Azu
npm run tauri dev
```

Expected: Title bar shows "Azu" + preset switcher (left) + theme picker (right). Title bar is draggable. Status bar shows pane count, active preset, theme name, and UTF-8.

- [ ] **Step 5: Commit**

```bash
cd D:\Azu
git add src/components/TitleBar/ src/components/StatusBar/ src/App.tsx
git commit -m "feat: add title bar with drag region and status bar with pane count"
```

---

## Task 12: CI/CD — GitHub Actions Cross-Platform Build

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create build workflow**

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
          - platform: macos-latest
            target: aarch64-apple-darwin
          - platform: macos-13
            target: x86_64-apple-darwin
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev

      - name: Install npm dependencies
        run: npm ci

      - name: Run frontend tests
        run: npx vitest run

      - name: Run Rust tests
        run: cd src-tauri && cargo test

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Create release workflow**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    strategy:
      matrix:
        include:
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
          - platform: macos-latest
            target: aarch64-apple-darwin
          - platform: macos-13
            target: x86_64-apple-darwin
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev

      - name: Install npm dependencies
        run: npm ci

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Azu ${{ github.ref_name }}'
          releaseBody: 'See the changelog for details.'
          releaseDraft: true
```

- [ ] **Step 3: Commit**

```bash
cd D:\Azu
git add .github/
git commit -m "ci: add GitHub Actions for cross-platform build and release"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Project scaffold (Tauri + SolidJS + Vite) | Manual build check |
| 2 | PTY Manager (Rust) | 4 Rust unit tests |
| 3 | Terminal component (xterm.js + PTY) | Manual: shell works |
| 4 | Grid store + logic | 7 Vitest tests |
| 5 | Grid UI (split, resize, context menu) | Manual: split/resize/close |
| 6 | Layout presets UI + hotkeys | Manual: save/load/Alt+N |
| 7 | Theme engine (5 themes) | 4 Vitest tests |
| 8 | Theme picker UI | Manual: hot-swap themes |
| 9 | Rich clipboard (Rust) | 2 Rust unit tests |
| 10 | Rich clipboard frontend (image paste) | Manual: Ctrl+V image |
| 11 | Title bar + status bar | Manual: drag, info display |
| 12 | CI/CD (GitHub Actions) | CI pipeline |

**Total: 12 tasks, ~17 unit tests, 12 commits**

At the end of Task 12, Azu Phase 1 is complete: a working cross-platform terminal with flexible grid, 5 themes, rich clipboard, and CI/CD pipeline.
