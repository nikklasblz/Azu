# Fase 2: Pipeline Automation — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Priority:** Core Pro feature ($5/mo)

## Summary

Extend Azu from a terminal grid into an AI agent orchestrator. Users configure pipelines where CLI agents (Claude Code, Codex) execute sequentially or in parallel across panes, with automatic chaining based on process exit detection.

## Goals

1. Load a preset → all agents launch automatically in their project directories
2. Agents chain: step 1 finishes → step 2 starts (auto or manual trigger)
3. Pipeline state visible in real-time (step N/M, timing, status per pane)
4. Clear Free vs Pro boundary — pipeline orchestration is Pro-only

## Non-Goals (this phase)

- Visual node editor (future evolution)
- Custom agent integrations beyond CLI tools
- Remote/SSH pipeline execution
- Billing/payment integration (separate spec)
- Export/import pipeline configs (future — presets already serialize pipeline data)

## Data Model

### GridNode Extension

```typescript
interface GridNode {
  // existing fields
  id: string
  type: 'leaf' | 'row' | 'column'
  panelType?: 'terminal' | 'ai' | 'project' | 'empty'
  children?: GridNode[]
  ratios?: number[]
  label?: string
  themeId?: string
  fontFamily?: string
  cwd?: string

  // NEW — pipeline config (Pro feature, only valid when panelType === 'terminal')
  pipeline?: PipelineNodeConfig
}

interface PipelineNodeConfig {
  command: string             // full CLI command, e.g. "claude -p" or "codex --full-auto"
  prompt?: string             // initial prompt/instruction
  trigger: 'auto' | 'manual'  // auto = launch on preset load or prev step done
  pipeMode: 'file' | 'text'   // file = shared cwd, text = pipe stdout via temp file
  order: number               // execution order, minimum 1 (same order = parallel)
  timeout?: number            // ms before step is considered hung (null = no timeout)
}
```

Note: `nextPane` is intentionally omitted. Chaining is driven purely by `order` grouping. A future visual node editor may introduce explicit graph connections.

### Pipeline State (runtime, not persisted)

```typescript
interface PipelineState {
  status: 'idle' | 'running' | 'paused' | 'done' | 'error'
  currentOrder: number
  maxOrder: number
  startedAt?: number
  paneStates: Record<string, PaneRunState>
}

interface PaneRunState {
  status: 'waiting' | 'running' | 'done' | 'error'
  exitCode?: number
  startedAt?: number
  finishedAt?: number
  capturedOutputFile?: string  // temp file path for pipe mode = text
}
```

## Architecture

### Component Boundaries

**Rust Backend (new module: `pipeline/`)**

- `PipelineRunner` — orchestrates execution across panes
  - Receives pipeline config + cell-to-PTY mapping from frontend
  - Monitors process exit codes via Child handle `.wait()`
  - For pipe mode = text: captures stdout to temp file (last 10KB)
  - Emits Tauri events for state changes
- `PtyManager` extensions:
  - Store `Child` handle from `spawn_command()` in `PtyInstance` (currently discarded)
  - `spawn_command_direct(cwd, cmd_with_args)` — spawns the agent binary directly as the PTY process (no shell wrapper), passing prompt via `-p` flag
  - `wait_exit(ptyId)` → spawns thread calling `child.wait()`, emits `pty-exit-{id}` with exit code
  - `capture_output(ptyId, enabled)` — toggles stdout mirroring to ring buffer

**SolidJS Frontend (new store + UI)**

- `stores/pipeline.ts` — reactive pipeline state, listens for Rust events
- `GridCell` toolbar extensions — ⚙ config button (only for panelType=terminal), status indicator, step badge
- `TitleBar` — "▶ Run Pipeline" button, global status display, Stop button
- `PipelineConfigPanel` — dropdown UI for per-pane pipeline settings

### Tauri Commands (new)

```
pipeline_start(panes: Vec<PipelinePane>)  → starts pipeline
pipeline_stop()                           → stops all running pipeline PTYs
pipeline_get_state()                      → returns current PipelineState
```

Where `PipelinePane` is:
```rust
struct PipelinePane {
    cell_id: String,
    pty_id: String,
    cwd: String,
    config: PipelineNodeConfig,
}
```

The frontend collects cell-to-PTY mappings from the active tab's `ptyMap` and sends the full list to `pipeline_start`. No `tab_id` needed — the frontend resolves tab context before calling.

### Tauri Events (new)

```
pipeline-step-started { paneId, order }
pipeline-step-done    { paneId, order, exitCode }
pipeline-error        { paneId, order, error }
pipeline-complete     { totalTime }
```

## Execution Flow

### 1. Pipeline Start

```
1. Frontend collects pipeline configs from all leaf panes with panelType=terminal
2. Validates:
   a. All orders are >= 1
   b. For file mode: consecutive order groups share the same cwd (error if not)
3. Sends PipelinePane[] to pipeline_start Tauri command
4. Rust PipelineRunner:
   a. Sorts panes by order
   b. Groups by order number (same order = parallel)
   c. For order=1 group, spawns each agent:
      - Builds full command: e.g. claude -p "{constructed prompt}"
      - Uses spawn_command_direct(cwd, cmd) — agent binary is the PTY process directly
      - No shell wrapper, no prompt injection delay
   d. Spawns wait thread per PTY to monitor exit
   e. Emits pipeline-step-started per pane
```

### 2. Step Completion

```
1. Child.wait() returns → PipelineRunner receives ExitStatus
2. If exit code 0:
   a. Mark pane status = done, record exit code
   b. If pipe mode = text: flush ring buffer to temp file
   c. Check if all panes in current order group are done
   d. If all done: advance to next order group
3. If exit code != 0:
   a. Mark pane status = error, record exit code
   b. Pause pipeline, emit pipeline-error event
   c. Frontend shows error state — user can retry or skip
```

### 3. Step Chaining

```
1. Next order group starts
2. For each pane in group:
   a. Build prompt with pipeline context (see Prompt Construction)
   b. If previous step used pipe mode = text:
      read captured output from temp file, include in prompt
   c. Spawn agent directly via spawn_command_direct
3. Repeat until all groups complete
4. Emit pipeline-complete, clean up temp files
```

### 4. Manual Trigger

```
For panes with trigger = 'manual':
- Pipeline pauses before this step
- "▶ Continue" button appears in pane toolbar
- User clicks → frontend calls pipeline_continue Tauri command → pipeline resumes
```

## Prompt Construction

Azu constructs the full CLI command with the prompt inline via the `-p` flag. The agent binary is spawned directly as the PTY process (no shell).

### Step 1 (no previous context)

```
Command: claude
Args: -p "[Pipeline step 1/3 | Project: D:\INDECOPI]
Previous steps: none (you are first).
Next step will: verify legal citations.

YOUR TASK:
analiza los expedientes nuevos y genera resumen

When done, exit. Do not ask for confirmation."
```

### Step 2+ (file mode — shared cwd)

```
Command: claude
Args: -p "[Pipeline step 2/3 | Project: D:\INDECOPI]
Previous step completed: analizar expedientes (exit 0).
Files in this directory were already modified by the previous step.

YOUR TASK:
revisa el resumen y verifica las citas legales

When done, exit. Do not ask for confirmation."
```

### Step 2+ (text mode — piped output)

For text mode, captured output is written to a temp file by the PipelineRunner. The prompt references the file:

```
Command: claude
Args: -p "[Pipeline step 2/3 | Project: D:\INDECOPI]
Previous step completed: analizar expedientes (exit 0).

Read the file C:\Users\narri\AppData\Local\Temp\azu-pipe-{uuid}.txt for the output of the previous step.

YOUR TASK:
genera el documento formal basado en el análisis anterior

When done, exit. Do not ask for confirmation."
```

Temp pipe files are cleaned up when the pipeline completes or stops.

### Shell escaping

The prompt is passed as a process argument (not through a shell), so shell escaping is not needed. The `CommandBuilder` from `portable-pty` handles argument passing safely.

## UI Components

### Pane Toolbar Extensions

- **Status indicator** (left of label): pulsing dot (running), checkmark (done), X (error), clock (waiting)
- **Step badge** (in label area): "step 1/3" text
- **⚙ Config button** (right side, only when `panelType === 'terminal'`): opens PipelineConfigPanel dropdown
- **▶ Continue button**: appears for manual-trigger panes when pipeline reaches their step

### PipelineConfigPanel (dropdown from ⚙)

Fields:
- Command (text input, monospace)
- Initial Prompt (textarea)
- Trigger (dropdown: Auto / Manual)
- Pipe Mode (dropdown: File / Text)
- Step Order (number input, min 1)
- Timeout (number input, optional, in seconds)
- Clear / Save buttons

### Title Bar

- **"▶ Run Pipeline"** button (replaces "▶ All" when any pane has pipeline config)
- **Status display**: "Step 1/3 · 2m 14s · ● running"
- **"■ Stop"** button (visible during pipeline run)

## Free vs Pro Boundary

### Free (Open Source)
- Terminal grid, splits, tabs
- 9 themes + per-pane themes
- Layout presets (save/load/delete)
- Per-pane cwd + folder picker
- ▶ Launch CLI (single pane, manual)
- Window transparency
- Image paste

### Pro ($5/month)
- Pipeline config per pane (⚙ button)
- Auto-trigger on process exit
- Manual trigger with ▶ Continue
- ▶ Run Pipeline (full orchestration)
- Pipe mode: file + text transfer
- Pipeline status + timing display
- Initial prompts per pane (saved in preset)
- Future: visual node editor, export/import configs

### Enforcement

Pipeline features are gated by a `proEnabled` flag in the app config. Client-side enforcement is intentional for this phase (consistent with open-core trust model). Server-side license validation is deferred to billing integration spec.

When Pro is not active:
- ⚙ button shows "Pro feature" tooltip
- "▶ Run Pipeline" shows upgrade prompt
- Pipeline configs in presets are preserved but not executed
- ▶ Launch CLI (single pane) remains free

## Preset Persistence

Presets already save GridNode trees via `deepClone`. The `pipeline` field on GridNode is automatically included. No changes needed to save/load logic.

When a preset with pipeline config is loaded:
1. Grid layout restores (existing behavior)
2. PTYs created with saved cwd (existing behavior)
3. If any pane has `pipeline.trigger === 'auto'`, show "Run Pipeline?" confirmation
4. User confirms → pipeline starts

## Validation Rules

- `order` must be >= 1 (reject 0 or negative)
- `pipeMode: 'file'` requires all panes in consecutive order groups to share the same `cwd` (emit error before launch if mismatched)
- `pipeline` config only valid on nodes with `panelType === 'terminal'` (or undefined, which defaults to terminal)
- `command` must not be empty

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Step exits with code != 0 | Pipeline pauses, pane shows error status, user can retry/skip |
| Step hangs (timeout exceeded) | PTY terminated, pane shows error, pipeline pauses |
| Step hangs (no timeout set) | User can manually stop via ■ Stop |
| Pipeline stopped by user | All running PTYs terminated, state reset to idle |
| App closed during pipeline | Pipeline state not persisted — on reopen, terminals are fresh |
| Network error (if agent needs API) | Agent CLI handles its own errors — Azu only sees exit code |
| File mode cwd mismatch | Pipeline refuses to start, shows validation error |

## Testing Strategy

- Unit tests for PipelineRunner (Rust): step ordering, parallel execution, exit code handling, validation
- Unit tests for prompt construction: inline prompt building, temp file for text mode
- Integration test: 3-pane pipeline with mock CLI that exits after delay
- Frontend tests: PipelineStore state transitions, UI status indicators
- Validation tests: order < 1 rejected, cwd mismatch detected, empty command rejected
