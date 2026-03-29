# Fase 2: Pipeline Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pipeline orchestration so CLI agents (Claude Code, Codex) chain automatically across panes — the core Pro ($5/mo) feature.

**Architecture:** Rust `PipelineRunner` module orchestrates agent execution via `portable-pty` Child handles. Frontend `pipeline.ts` store tracks state reactively via Tauri events. Pipeline config stored on `GridNode.pipeline`, persisted with presets.

**Tech Stack:** Rust (portable-pty, tauri, serde), SolidJS (solid-js/store, @tauri-apps/api/event), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-28-fase2-pipeline-automation.md`

---

## File Structure

### Rust (new)
- `src-tauri/src/pipeline/mod.rs` — module export
- `src-tauri/src/pipeline/runner.rs` — PipelineRunner: orchestration, step chaining, stdout capture
- `src-tauri/src/pipeline/types.rs` — PipelinePane, PipelineNodeConfig, PipelineState, PaneRunState structs
- `src-tauri/src/commands/pipeline.rs` — Tauri commands: pipeline_start, pipeline_stop, pipeline_continue, pipeline_get_state

### Rust (modify)
- `src-tauri/src/pty/manager.rs` — Store Child handle, add spawn_command_direct, wait_exit, capture_output ring buffer
- `src-tauri/src/commands/pty.rs` — Emit exit code in pty-exit event
- `src-tauri/src/commands/mod.rs` — Add pipeline module
- `src-tauri/src/lib.rs` — Register pipeline commands, manage PipelineRunner state

### Frontend (new)
- `src/stores/pipeline.ts` — PipelineState store, Tauri event listeners
- `src/components/Grid/PipelineConfigPanel.tsx` — Per-pane pipeline settings dropdown

### Frontend (modify)
- `src/stores/grid.ts` — Add PipelineNodeConfig to GridNode
- `src/components/Grid/GridCell.tsx` — Add ⚙ config button, status indicator, step badge
- `src/components/TitleBar/TitleBar.tsx` — Replace ▶ All with ▶ Run Pipeline + status + Stop
- `src/lib/tauri-commands.ts` — Add pipeline commands
- `src/App.tsx` — Wire pipeline store, pass handlers

---

## Task 1: Store Child Handle + Exit Code + spawn_command_direct + capture_output

**Files:**
- Modify: `src-tauri/src/pty/manager.rs:7-12` (PtyInstance struct)
- Modify: `src-tauri/src/pty/manager.rs:25-48` (spawn method)
- Modify: `src-tauri/src/commands/pty.rs:6-28` (create_pty — emit exit code)

- [ ] **Step 1: Write failing test — spawn returns Child handle**

```rust
// In src-tauri/src/pty/manager.rs, add to tests module:
#[test]
fn test_spawn_returns_child_exit_code() {
    let mgr = PtyManager::new();
    let id = mgr.spawn(24, 80, None).expect("should spawn");
    // Write "exit 0" to make shell exit
    mgr.write(&id, b"exit\r\n").expect("should write");
    std::thread::sleep(std::time::Duration::from_secs(1));
    let code = mgr.get_exit_code(&id);
    assert!(code.is_some());
    mgr.close(&id).ok();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Azu\src-tauri && cargo test test_spawn_returns_child_exit_code -- --nocapture`
Expected: FAIL — `get_exit_code` not defined

- [ ] **Step 3: Implement — store Child, add exit code tracking**

In `src-tauri/src/pty/manager.rs`:

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize, Child};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct PtyInstance {
    #[allow(dead_code)]
    pub id: String,
    writer: Box<dyn Write + Send>,
    pair: portable_pty::PtyPair,
    child: Option<Box<dyn Child + Send>>,
    exit_code: Arc<Mutex<Option<u32>>>,
}

// In spawn():
let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
let id = Uuid::new_v4().to_string();
let exit_code = Arc::new(Mutex::new(None));

let instance = PtyInstance {
    id: id.clone(),
    writer,
    pair,
    child: Some(child),
    exit_code,
};

// New method:
pub fn get_exit_code(&self, id: &str) -> Option<u32> {
    let instances = self.instances.lock().unwrap();
    let instance = instances.get(id)?;
    *instance.exit_code.lock().unwrap()
}

// New method — spawns thread that waits for exit.
// IMPORTANT: call take_reader() BEFORE wait_for_exit() to avoid lock contention.
// spawn() returns (id, exit_code_arc) so create_pty can chain calls without re-locking.
pub fn wait_for_exit(&self, id: &str) -> Result<Arc<Mutex<Option<u32>>>, String> {
    let mut instances = self.instances.lock().unwrap();
    let instance = instances.get_mut(id).ok_or("PTY not found")?;
    let mut child = instance.child.take().ok_or("Child already taken")?;
    let exit_code = instance.exit_code.clone();
    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            let code = status.exit_code();
            *exit_code.lock().unwrap() = Some(code);
        }
    });
    Ok(instance.exit_code.clone())
}

// New method — spawn agent binary directly as PTY process (no shell wrapper).
// Used by PipelineRunner to launch CLI agents like `claude -p "prompt"`.
pub fn spawn_command_direct(&self, cwd: &str, program: &str, args: &[&str]) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(program);
    for arg in args { cmd.arg(arg); }
    let working_dir = std::path::PathBuf::from(cwd);
    if working_dir.is_dir() { cmd.cwd(working_dir); }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let exit_code = Arc::new(Mutex::new(None));

    let instance = PtyInstance {
        id: id.clone(), writer, pair,
        child: Some(child), exit_code,
        output_buffer: Arc::new(Mutex::new(None)),
    };
    self.instances.lock().unwrap().insert(id.clone(), instance);
    Ok(id)
}

// New method — enable stdout capture to ring buffer (last 10KB) for text pipe mode.
pub fn enable_capture(&self, id: &str) -> Result<(), String> {
    let instances = self.instances.lock().unwrap();
    let instance = instances.get(id).ok_or("PTY not found")?;
    *instance.output_buffer.lock().unwrap() = Some(String::with_capacity(10240));
    Ok(())
}

pub fn get_captured_output(&self, id: &str) -> Option<String> {
    let instances = self.instances.lock().unwrap();
    let instance = instances.get(id)?;
    instance.output_buffer.lock().unwrap().clone()
}
```

Add `output_buffer` field to PtyInstance:
```rust
pub struct PtyInstance {
    pub id: String,
    writer: Box<dyn Write + Send>,
    pair: portable_pty::PtyPair,
    child: Option<Box<dyn Child + Send>>,
    exit_code: Arc<Mutex<Option<u32>>>,
    output_buffer: Arc<Mutex<Option<String>>>,  // ring buffer for text pipe mode
}
```

- [ ] **Step 4: Update create_pty command to emit exit code**

In `src-tauri/src/commands/pty.rs`:

```rust
#[tauri::command]
pub fn create_pty(state: State<'_, PtyManager>, app: AppHandle, rows: u16, cols: u16, cwd: Option<String>) -> Result<String, String> {
    let id = state.spawn(rows, cols, cwd)?;
    let reader = state.take_reader(&id)?;
    let exit_code_ref = state.wait_for_exit(&id)?;
    let pty_id = id.clone();
    let pty_id2 = id.clone();
    let app2 = app.clone();

    // Reader thread (existing)
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
    });

    // Exit code emitter thread (new)
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            if let Some(code) = *exit_code_ref.lock().unwrap() {
                let _ = app2.emit(&format!("pty-exit-{}", pty_id2), code);
                break;
            }
        }
    });

    Ok(id)
}
```

- [ ] **Step 5: Run tests**

Run: `cd D:\Azu\src-tauri && cargo test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/pty/manager.rs src-tauri/src/commands/pty.rs
git commit -m "feat: store Child handle, emit exit code on pty-exit event"
```

---

## Task 2: Pipeline Types + Runner Module (Rust)

**Files:**
- Create: `src-tauri/src/pipeline/mod.rs`
- Create: `src-tauri/src/pipeline/types.rs`
- Create: `src-tauri/src/pipeline/runner.rs`

- [ ] **Step 1: Create pipeline types**

`src-tauri/src/pipeline/types.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineNodeConfig {
    pub command: String,
    pub prompt: Option<String>,
    pub trigger: String,       // "auto" | "manual"
    pub pipe_mode: String,     // "file" | "text"
    pub order: u32,
    pub timeout: Option<u64>,  // ms
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelinePane {
    pub cell_id: String,
    pub pty_id: String,
    pub cwd: String,
    pub config: PipelineNodeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineState {
    pub status: String,        // "idle" | "running" | "paused" | "done" | "error"
    pub current_order: u32,
    pub max_order: u32,
    pub started_at: Option<u64>,
    pub pane_states: std::collections::HashMap<String, PaneRunState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneRunState {
    pub status: String,        // "waiting" | "running" | "done" | "error"
    pub exit_code: Option<u32>,
    pub started_at: Option<u64>,
    pub finished_at: Option<u64>,
    pub captured_output_file: Option<String>,
}

impl PipelineState {
    pub fn new() -> Self {
        Self {
            status: "idle".into(),
            current_order: 0,
            max_order: 0,
            started_at: None,
            pane_states: std::collections::HashMap::new(),
        }
    }
}
```

- [ ] **Step 2: Create pipeline runner skeleton**

`src-tauri/src/pipeline/runner.rs`:
```rust
use crate::pipeline::types::*;
use crate::pty::PtyManager;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct PipelineRunner {
    state: Arc<Mutex<PipelineState>>,
    pty_manager: Arc<Mutex<Option<tauri::State<'static, PtyManager>>>>,
}

impl PipelineRunner {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(PipelineState::new())),
            pty_manager: Arc::new(Mutex::new(None)),
        }
    }

    pub fn get_state(&self) -> PipelineState {
        self.state.lock().unwrap().clone()
    }

    pub fn validate(panes: &[PipelinePane]) -> Result<(), String> {
        // Check all orders >= 1
        for p in panes {
            if p.config.order < 1 {
                return Err(format!("Pane {} has order < 1", p.cell_id));
            }
            if p.config.command.is_empty() {
                return Err(format!("Pane {} has empty command", p.cell_id));
            }
        }
        // Check file mode cwd consistency
        let mut by_order: std::collections::HashMap<u32, Vec<&PipelinePane>> = std::collections::HashMap::new();
        for p in panes {
            by_order.entry(p.config.order).or_default().push(p);
        }
        let mut orders: Vec<u32> = by_order.keys().copied().collect();
        orders.sort();
        for window in orders.windows(2) {
            let prev_cwds: Vec<&str> = by_order[&window[0]].iter()
                .filter(|p| p.config.pipe_mode == "file")
                .map(|p| p.cwd.as_str())
                .collect();
            let curr_cwds: Vec<&str> = by_order[&window[1]].iter()
                .filter(|p| p.config.pipe_mode == "file")
                .map(|p| p.cwd.as_str())
                .collect();
            for cwd in &curr_cwds {
                if !prev_cwds.is_empty() && !prev_cwds.contains(cwd) {
                    return Err(format!("File mode pane with cwd {} doesn't match previous step cwds", cwd));
                }
            }
        }
        Ok(())
    }

    pub fn start(&self, app: AppHandle, panes: Vec<PipelinePane>, pty_manager: &PtyManager) -> Result<(), String> {
        Self::validate(&panes)?;

        let mut orders: Vec<u32> = panes.iter().map(|p| p.config.order).collect();
        orders.sort();
        orders.dedup();
        let max_order = *orders.last().unwrap_or(&1);

        let mut state = self.state.lock().unwrap();
        state.status = "running".into();
        state.current_order = orders[0];
        state.max_order = max_order;
        state.started_at = Some(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64);

        for p in &panes {
            state.pane_states.insert(p.cell_id.clone(), PaneRunState {
                status: "waiting".into(),
                exit_code: None,
                started_at: None,
                finished_at: None,
                captured_output_file: None,
            });
        }

        // Launch first order group
        let first_order = orders[0];
        let first_group: Vec<PipelinePane> = panes.iter()
            .filter(|p| p.config.order == first_order)
            .cloned()
            .collect();

        drop(state);
        self.launch_group(app, first_group, &panes, pty_manager)?;
        Ok(())
    }

    pub fn stop(&self) {
        let mut state = self.state.lock().unwrap();
        state.status = "idle".into();
        // PTY cleanup handled by frontend closing panes
    }

    fn launch_group(&self, app: AppHandle, group: Vec<PipelinePane>, _all_panes: &[PipelinePane], pty_manager: &PtyManager) -> Result<(), String> {
        for pane in &group {
            let prompt = self.build_prompt(pane, &self.state.lock().unwrap());
            let full_cmd = format!("{} -p \"{}\"", pane.config.command, prompt.replace('"', "\\\""));

            // Write command to existing PTY
            pty_manager.write(&pane.pty_id, full_cmd.as_bytes())?;
            pty_manager.write(&pane.pty_id, b"\r")?;

            let mut state = self.state.lock().unwrap();
            if let Some(ps) = state.pane_states.get_mut(&pane.cell_id) {
                ps.status = "running".into();
                ps.started_at = Some(std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64);
            }

            let _ = app.emit("pipeline-step-started", serde_json::json!({
                "paneId": pane.cell_id,
                "order": pane.config.order,
            }));
        }
        Ok(())
    }

    fn build_prompt(&self, pane: &PipelinePane, all_panes: &[PipelinePane], state: &PipelineState) -> String {
        let step = pane.config.order;
        let total = state.max_order;
        let user_prompt = pane.config.prompt.clone().unwrap_or_default();

        // Previous step context
        let prev_context = if step > 1 {
            let prev_panes: Vec<&PipelinePane> = all_panes.iter()
                .filter(|p| p.config.order == step - 1)
                .collect();
            let prev_names: Vec<String> = prev_panes.iter()
                .map(|p| {
                    let ps = state.pane_states.get(&p.cell_id);
                    let code = ps.and_then(|s| s.exit_code).unwrap_or(0);
                    format!("{} (exit {})", p.config.prompt.as_deref().unwrap_or("previous task"), code)
                })
                .collect();
            format!("Previous step completed: {}.", prev_names.join(", "))
        } else {
            "Previous steps: none (you are first).".to_string()
        };

        // Next step preview
        let next_context = {
            let next_panes: Vec<&PipelinePane> = all_panes.iter()
                .filter(|p| p.config.order == step + 1)
                .collect();
            if next_panes.is_empty() {
                "You are the last step.".to_string()
            } else {
                let next_names: Vec<&str> = next_panes.iter()
                    .map(|p| p.config.prompt.as_deref().unwrap_or("next task"))
                    .collect();
                format!("Next step will: {}.", next_names.join(", "))
            }
        };

        // File mode context
        let file_context = if pane.config.pipe_mode == "file" && step > 1 {
            "\nFiles in this directory were already modified by the previous step."
        } else { "" };

        // Text mode context (read from temp file)
        let text_context = if pane.config.pipe_mode == "text" && step > 1 {
            // PipelineRunner will have flushed captured output to a temp file
            let prev_pane = all_panes.iter().find(|p| p.config.order == step - 1);
            if let Some(pp) = prev_pane {
                if let Some(ps) = state.pane_states.get(&pp.cell_id) {
                    if let Some(ref path) = ps.captured_output_file {
                        format!("\nRead the file {} for the output of the previous step.", path)
                    } else { String::new() }
                } else { String::new() }
            } else { String::new() }
        } else { String::new() };

        format!(
            "[Pipeline step {}/{} | Project: {}]\n{}\n{}{}{}\n\n\
             YOUR TASK:\n{}\n\n\
             When done, exit. Do not ask for confirmation.",
            step, total, pane.cwd, prev_context, next_context, file_context, text_context, user_prompt
        )
    }
}
```

- [ ] **Step 3: Create module export**

`src-tauri/src/pipeline/mod.rs`:
```rust
pub mod types;
pub mod runner;

pub use runner::PipelineRunner;
pub use types::*;
```

- [ ] **Step 4: Run cargo check**

Run: `cd D:\Azu\src-tauri && cargo check`
Expected: Compiles (warnings OK)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/
git commit -m "feat: pipeline runner module with types, validation, and execution"
```

---

## Task 3: Pipeline Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/pipeline.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create pipeline commands**

`src-tauri/src/commands/pipeline.rs`:
```rust
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
    runner.start(app, panes, &pty_manager)
}

#[tauri::command]
pub fn pipeline_stop(runner: State<'_, PipelineRunner>) -> Result<(), String> {
    runner.stop();
    Ok(())
}

#[tauri::command]
pub fn pipeline_continue(runner: State<'_, PipelineRunner>, app: AppHandle, pty_manager: State<'_, PtyManager>) -> Result<(), String> {
    runner.continue_pipeline(app, &pty_manager)
}

#[tauri::command]
pub fn pipeline_get_state(runner: State<'_, PipelineRunner>) -> Result<PipelineState, String> {
    Ok(runner.get_state())
}
```

- [ ] **Step 2: Register module and commands**

In `src-tauri/src/commands/mod.rs`, add:
```rust
pub mod pipeline;
```

In `src-tauri/src/lib.rs`, add `PipelineRunner` to managed state and register commands:
```rust
mod pipeline;
// ...
.manage(PtyManager::new())
.manage(pipeline::PipelineRunner::new())
// ...
commands::pipeline::pipeline_start,
commands::pipeline::pipeline_stop,
commands::pipeline::pipeline_continue,
commands::pipeline::pipeline_get_state,
```

- [ ] **Step 3: Run cargo check**

Run: `cd D:\Azu\src-tauri && cargo check`
Expected: Compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/pipeline.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: pipeline Tauri commands (start, stop, get_state)"
```

---

## Task 4: Frontend — GridNode Pipeline Config + Store

**Files:**
- Modify: `src/stores/grid.ts:4-14` (GridNode interface)
- Create: `src/stores/pipeline.ts`
- Modify: `src/lib/tauri-commands.ts`

- [ ] **Step 1: Add PipelineNodeConfig to GridNode**

In `src/stores/grid.ts`, extend the interface:
```typescript
export interface PipelineNodeConfig {
  command: string
  prompt?: string
  trigger: 'auto' | 'manual'
  pipeMode: 'file' | 'text'
  order: number
  timeout?: number
}

export interface GridNode {
  // ... existing fields ...
  cwd?: string
  pipeline?: PipelineNodeConfig  // NEW
}
```

Add helpers:
```typescript
export function findAllLeaves(node: GridNode): GridNode[] {
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(findAllLeaves)
}

export function setCellPipeline(cellId: string, pipeline: PipelineNodeConfig | undefined) {
  setGridStore('root', (root) =>
    findAndReplace(root, cellId, (node) => ({ ...node, pipeline }))
  )
}
```

- [ ] **Step 2: Create pipeline store**

`src/stores/pipeline.ts`:
```typescript
import { createStore } from 'solid-js/store'
import { listen } from '@tauri-apps/api/event'

interface PaneRunState {
  status: 'waiting' | 'running' | 'done' | 'error'
  exitCode?: number
  startedAt?: number
  finishedAt?: number
}

interface PipelineState {
  status: 'idle' | 'running' | 'paused' | 'done' | 'error'
  currentOrder: number
  maxOrder: number
  startedAt?: number
  paneStates: Record<string, PaneRunState>
}

const [pipelineStore, setPipelineStore] = createStore<PipelineState>({
  status: 'idle',
  currentOrder: 0,
  maxOrder: 0,
  paneStates: {},
})

export function initPipelineListeners() {
  listen<{ paneId: string; order: number }>('pipeline-step-started', (e) => {
    setPipelineStore('paneStates', e.payload.paneId, {
      status: 'running',
      startedAt: Date.now(),
    })
  })

  listen<{ paneId: string; order: number; exitCode: number }>('pipeline-step-done', (e) => {
    setPipelineStore('paneStates', e.payload.paneId, {
      status: e.payload.exitCode === 0 ? 'done' : 'error',
      exitCode: e.payload.exitCode,
      finishedAt: Date.now(),
    })
  })

  listen<{ paneId: string; error: string }>('pipeline-error', (e) => {
    setPipelineStore('status', 'error')
    setPipelineStore('paneStates', e.payload.paneId, 'status', 'error')
  })

  listen<{ totalTime: number }>('pipeline-complete', () => {
    setPipelineStore('status', 'done')
  })
}

export function resetPipeline() {
  setPipelineStore({
    status: 'idle',
    currentOrder: 0,
    maxOrder: 0,
    startedAt: undefined,
    paneStates: {},
  })
}

export { pipelineStore }
```

- [ ] **Step 3: Add pipeline commands to tauri bridge**

In `src/lib/tauri-commands.ts`:
```typescript
export const pipeline = {
  start: (panes: Array<{ cellId: string; ptyId: string; cwd: string; config: any }>): Promise<void> =>
    invoke('pipeline_start', { panes: panes.map(p => ({
      cell_id: p.cellId, pty_id: p.ptyId, cwd: p.cwd, config: {
        command: p.config.command,
        prompt: p.config.prompt || null,
        trigger: p.config.trigger,
        pipe_mode: p.config.pipeMode,
        order: p.config.order,
        timeout: p.config.timeout || null,
      }
    })) }),
  stop: (): Promise<void> => invoke('pipeline_stop'),
  continue_: (): Promise<void> => invoke('pipeline_continue'),
  getState: (): Promise<any> => invoke('pipeline_get_state'),
}
```

- [ ] **Step 4: Build check**

Run: `cd D:\Azu && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/stores/grid.ts src/stores/pipeline.ts src/lib/tauri-commands.ts
git commit -m "feat: pipeline config on GridNode, pipeline store, Tauri bridge"
```

---

## Task 5: Pipeline Config Panel UI

**Files:**
- Create: `src/components/Grid/PipelineConfigPanel.tsx`
- Modify: `src/components/Grid/GridCell.tsx:144-178` (add ⚙ button, status indicator)

- [ ] **Step 1: Create PipelineConfigPanel component**

`src/components/Grid/PipelineConfigPanel.tsx`:
```typescript
import { Component, createSignal, Show } from 'solid-js'
import { PipelineNodeConfig, setCellPipeline } from '../../stores/grid'

interface Props {
  cellId: string
  pipeline?: PipelineNodeConfig
  colors: any
  onClose: () => void
}

const PipelineConfigPanel: Component<Props> = (props) => {
  const [command, setCommand] = createSignal(props.pipeline?.command || '')
  const [prompt, setPrompt] = createSignal(props.pipeline?.prompt || '')
  const [trigger, setTrigger] = createSignal(props.pipeline?.trigger || 'auto')
  const [pipeMode, setPipeMode] = createSignal(props.pipeline?.pipeMode || 'file')
  const [order, setOrder] = createSignal(props.pipeline?.order || 1)

  const handleSave = () => {
    if (!command().trim()) return
    setCellPipeline(props.cellId, {
      command: command(),
      prompt: prompt() || undefined,
      trigger: trigger() as 'auto' | 'manual',
      pipeMode: pipeMode() as 'file' | 'text',
      order: order(),
    })
    props.onClose()
  }

  const handleClear = () => {
    setCellPipeline(props.cellId, undefined)
    props.onClose()
  }

  const inputStyle = () => ({
    background: props.colors.surface,
    color: props.colors.text,
    border: `1px solid ${props.colors.border}`,
  })

  return (
    <div
      class="absolute top-full left-0 mt-px rounded shadow-lg z-50 p-3 min-w-72"
      style={{ background: props.colors.surface, border: `1px solid ${props.colors.border}` }}
    >
      <div class="text-[10px] uppercase tracking-wider mb-2" style={{ color: props.colors.textMuted }}>
        Pipeline Config
      </div>

      <label class="block text-[10px] mb-1" style={{ color: props.colors.textMuted }}>Command</label>
      <input
        class="w-full px-2 py-1 text-xs rounded font-mono mb-2"
        style={inputStyle()}
        value={command()}
        onInput={(e) => setCommand(e.target.value)}
        placeholder="claude -p"
      />

      <label class="block text-[10px] mb-1" style={{ color: props.colors.textMuted }}>Initial Prompt</label>
      <textarea
        class="w-full px-2 py-1 text-xs rounded resize-none mb-2"
        style={{ ...inputStyle(), 'min-height': '48px' }}
        value={prompt()}
        onInput={(e) => setPrompt(e.target.value)}
        placeholder="analiza los expedientes..."
      />

      <div class="flex gap-2 mb-2">
        <div class="flex-1">
          <label class="block text-[10px] mb-1" style={{ color: props.colors.textMuted }}>Trigger</label>
          <select
            class="w-full px-2 py-1 text-xs rounded"
            style={inputStyle()}
            value={trigger()}
            onChange={(e) => setTrigger(e.target.value as any)}
          >
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-[10px] mb-1" style={{ color: props.colors.textMuted }}>Pipe Mode</label>
          <select
            class="w-full px-2 py-1 text-xs rounded"
            style={inputStyle()}
            value={pipeMode()}
            onChange={(e) => setPipeMode(e.target.value as any)}
          >
            <option value="file">File (shared cwd)</option>
            <option value="text">Text (pipe output)</option>
          </select>
        </div>
      </div>

      <div class="mb-3">
        <label class="block text-[10px] mb-1" style={{ color: props.colors.textMuted }}>Step Order</label>
        <input
          type="number"
          min="1"
          class="w-20 px-2 py-1 text-xs rounded"
          style={inputStyle()}
          value={order()}
          onInput={(e) => setOrder(parseInt(e.target.value) || 1)}
        />
      </div>

      <div class="flex gap-2 justify-end">
        <button
          class="px-3 py-1 text-xs rounded"
          style={{ color: props.colors.textMuted }}
          onClick={handleClear}
        >Clear</button>
        <button
          class="px-3 py-1 text-xs rounded"
          style={{ background: props.colors.accent, color: props.colors.surface }}
          onClick={handleSave}
        >Save</button>
      </div>
    </div>
  )
}

export default PipelineConfigPanel
```

- [ ] **Step 2: Add ⚙ button and status indicator to GridCell toolbar**

In `src/components/Grid/GridCell.tsx`, import PipelineConfigPanel and pipelineStore. Add state:
```typescript
const [showPipelineConfig, setShowPipelineConfig] = createSignal(false)
```

Add to toolbar (after launch button, before label):
```typescript
{/* Pipeline status indicator */}
<Show when={paneStatus()}>
  <div class="w-6 h-5 flex items-center justify-center" title={`Pipeline: ${paneStatus()}`}>
    <span class={`w-2 h-2 rounded-full ${
      paneStatus() === 'running' ? 'bg-green-400 animate-pulse' :
      paneStatus() === 'done' ? 'bg-green-400' :
      paneStatus() === 'error' ? 'bg-red-400' : 'bg-gray-400'
    }`} />
  </div>
</Show>
```

Add ⚙ button (after theme selector, before close):
```typescript
{/* Pipeline config */}
<div class="relative">
  <button
    class="w-6 h-5 flex items-center justify-center hover:bg-white/8"
    onClick={() => setShowPipelineConfig(!showPipelineConfig())}
    title="Pipeline settings"
  >
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z"/>
    </svg>
  </button>
  <Show when={showPipelineConfig()}>
    <PipelineConfigPanel
      cellId={props.node.id}
      pipeline={props.node.pipeline}
      colors={colors()}
      onClose={() => setShowPipelineConfig(false)}
    />
  </Show>
</div>
```

- [ ] **Step 3: Build check**

Run: `cd D:\Azu && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/Grid/PipelineConfigPanel.tsx src/components/Grid/GridCell.tsx
git commit -m "feat: pipeline config panel UI + status indicator in toolbar"
```

---

## Task 6: Title Bar — Run Pipeline + Status + Stop

**Files:**
- Modify: `src/components/TitleBar/TitleBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add pipeline handlers to App.tsx**

```typescript
import { pipeline as pipelineCmd } from './lib/tauri-commands'
import { pipelineStore, initPipelineListeners } from './stores/pipeline'
import { gridStore, findNode } from './stores/grid'

// In onMount:
initPipelineListeners()

// New handler:
const handleRunPipeline = async () => {
  const tab = activeTab()
  if (!tab) return
  // Collect panes with pipeline config
  const leaves = findAllLeaves(gridStore.root)
  const panes = leaves
    .filter(n => n.pipeline)
    .map(n => ({
      cellId: n.id,
      ptyId: tab.ptyMap[n.id] || '',
      cwd: n.cwd || '',
      config: n.pipeline!,
    }))
    .filter(p => p.ptyId)
  if (panes.length === 0) return
  await pipelineCmd.start(panes)
}

const handleStopPipeline = async () => {
  await pipelineCmd.stop()
}
```

Pass to TitleBar: `onRunPipeline={handleRunPipeline} onStopPipeline={handleStopPipeline}`

- [ ] **Step 2: Update TitleBar — replace ▶ All with ▶ Run Pipeline when pipeline exists**

Replace the ▶ All button block with conditional rendering:
- If any pane has pipeline config → show "▶ Run Pipeline" + status + Stop
- Otherwise → show existing "▶ All" dropdown

- [ ] **Step 3: Build check**

Run: `cd D:\Azu && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/TitleBar/TitleBar.tsx
git commit -m "feat: Run Pipeline button in title bar with status and stop"
```

---

## Task 7: Integration Test + Final Wiring

**Files:**
- All files from Tasks 1-6

- [ ] **Step 1: Run full Rust test suite**

Run: `cd D:\Azu\src-tauri && cargo test`
Expected: All pass

- [ ] **Step 2: Run full frontend build**

Run: `cd D:\Azu && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Run: `cd D:\Azu && npx tauri dev`
Test:
1. Open Azu, create 2 panes (split)
2. Click ⚙ on pane 1, set: command=`echo`, prompt=`hello step 1`, trigger=auto, order=1
3. Click ⚙ on pane 2, set: command=`echo`, prompt=`hello step 2`, trigger=auto, order=2
4. Click "▶ Run Pipeline"
5. Verify: pane 1 runs first, pane 2 runs after pane 1 finishes
6. Save as preset, reload, verify pipeline config persists

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Fase 2 pipeline automation — complete implementation"
```

---

## Task 8: Pro Gate + Preset Auto-Start

**Files:**
- Modify: `src/stores/pipeline.ts` (add proEnabled flag)
- Modify: `src/components/Grid/GridCell.tsx` (gate ⚙ button)
- Modify: `src/App.tsx` (preset load auto-start confirmation)

- [ ] **Step 1: Add proEnabled to pipeline store**

In `src/stores/pipeline.ts`:
```typescript
// For now, client-side only. Server-side validation deferred to billing spec.
const [proEnabled, setProEnabled] = createSignal(false)
export { proEnabled, setProEnabled }
```

- [ ] **Step 2: Gate ⚙ button in GridCell**

```typescript
import { proEnabled } from '../../stores/pipeline'

// In toolbar, wrap ⚙ button:
<Show when={proEnabled()} fallback={
  <button class="w-6 h-5 flex items-center justify-center opacity-30" title="Pro feature — pipeline config">
    {/* gear icon */}
  </button>
}>
  {/* existing ⚙ button with PipelineConfigPanel */}
</Show>
```

- [ ] **Step 3: Add preset load auto-start confirmation**

In `src/App.tsx`, after `loadPreset(name)` is called:
```typescript
// Check if loaded preset has auto-trigger panes
const leaves = findAllLeaves(gridStore.root)
const autoTriggers = leaves.filter(n => n.pipeline?.trigger === 'auto')
if (autoTriggers.length > 0 && proEnabled()) {
  if (confirm(`Preset has ${autoTriggers.length} pipeline steps. Run pipeline?`)) {
    handleRunPipeline()
  }
}
```

- [ ] **Step 4: Build and test**

Run: `cd D:\Azu && npx vite build`
Expected: Build succeeds. With `proEnabled = false`, ⚙ button is dimmed.

- [ ] **Step 5: Commit**

```bash
git add src/stores/pipeline.ts src/components/Grid/GridCell.tsx src/App.tsx
git commit -m "feat: Pro gate for pipeline features + preset auto-start confirmation"
```
