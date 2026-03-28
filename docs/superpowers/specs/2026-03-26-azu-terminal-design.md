# Azu — AI-Native Terminal for Developers

## Overview

Azu is a cross-platform (Windows/macOS/Linux) terminal application built with Tauri v2, designed as the definitive frontend for AI coding agents. It combines a flexible grid-based terminal multiplexer with native AI integration (Claude Code, Codex), rich clipboard support, and project management capabilities.

**Target audience:** Intermediate developers who already use the terminal and want more productivity — especially those working with AI coding tools.

**Business model:** Open-core. Free terminal with premium Pro ($5/month) and Team ($15/seat/month) tiers. Dual strategy: B2C direct sales + B2B partnership/white-label with AI companies (Anthropic, OpenAI).

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (WebView)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Terminal  │ │ AI Panel │ │ Project  │ │ Theme  │ │
│  │ (xterm.js)│ │ (Chat UI)│ │ Manager  │ │ Engine │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│               BACKEND (Rust / Tauri v2)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ PTY Mgr  │ │ AI Bridge│ │ SSH Mgr  │ │ Plugin │ │
│  │(portable │ │ (tokio   │ │ (russh)  │ │ Host   │ │
│  │  -pty)   │ │ process) │ │          │ │(wasmtime│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│                    DATA LAYER                        │
│  SQLite (rusqlite) │ Config (TOML) │ Clipboard      │
│  Cloud Sync (R2)   │ Runtime Mgr   │ (arboard+image)│
└─────────────────────────────────────────────────────┘
```

### Frontend

- **UI Framework:** SolidJS — no virtual DOM, ~7KB, fastest reactive framework
- **Grid Layout:** CSS Grid + custom drag & drop (dnd-kit). Resize handles, snap-to-grid, layout serialization to JSON
- **Styling:** UnoCSS (atomic, ~4KB) + CSS custom properties for theming. Hot-swap themes without reload
- **Markdown/Diff:** marked + diff2html + Shiki for syntax highlighting
- **State:** SolidJS signals and stores (no external state library)
- **Build:** Vite with HMR

### Backend (Rust)

- **PTY:** portable-pty crate — ConPTY on Windows, forkpty on Unix. Async multiplexing via tokio
- **AI Bridge:** tokio::process to spawn CLI processes (claude, codex). Bidirectional IPC via Tauri events, streaming stdout/stderr to frontend
- **SSH:** russh — pure Rust SSH2 client. Async, key auth, agent forwarding, port forwarding, SFTP
- **Database:** rusqlite — snippets, command history, SSH profiles, user preferences. Migrations via refinery
- **Config:** TOML + serde. Hot-reload via notify file watcher
- **Clipboard:** arboard (cross-platform text + image) + image crate for PNG/JPEG encode/decode
- **Plugin Host:** wasmtime (Bytecode Alliance WASM runtime). Sandboxed execution, host function API for controlled access

### Runtime Management (Managed Node)

Azu manages its own isolated Node.js runtime for AI CLI tools:

- On first launch, downloads Node LTS to `~/.azu/runtime/node/`
- Does NOT interfere with user's system Node installation
- Detects existing CLI installations (claude, codex) and offers to use them or install isolated copies
- Handles version management (e.g., if Claude Code requires Node 20+ but user has Node 16)
- Auto-updates runtime in background

### Infrastructure & Services

- **Cloud Sync:** Cloudflare R2 (S3-compatible, zero egress fees). Client-side E2E encryption before upload
- **Auth:** Clerk (free to 10K MAU). GitHub/Google OAuth. License key validation for Pro tier
- **Payments:** Lemon Squeezy (merchant of record, handles global tax/VAT). Webhook → auto license key
- **CI/CD:** GitHub Actions — cross-platform builds (Win/Mac/Linux) on each release. Tauri official action
- **Landing Page:** Astro + Vercel (free tier). Blog for changelogs
- **Analytics:** PostHog (open-source, free tier). Feature flags for gradual Pro rollout

## UI Layout: Flexible Grid

The core differentiator. A tiling window manager for the terminal — like tmux but visual, with drag & drop.

### Grid System

- Each cell can be: Terminal, AI Panel, Project Manager, SSH session, or any plugin panel
- Drag & drop to reorganize cells
- Resize with mouse or keyboard
- Named layout presets saveable per workflow (e.g., "trading", "dev", "legal")
- Quick-switch between presets (Alt+1, Alt+2, etc.)
- Broadcast input to multiple terminal panes simultaneously

### Panel Types

1. **Terminal** — xterm.js instance with PTY, full shell support
2. **AI Panel** — Claude Code or Codex CLI rendered with markdown, diffs, mockups
3. **Project Manager** — file tree with git status, task tracker, parallel agent status
4. **SSH Session** — remote terminal via russh with auto-reconnect
5. **SFTP Browser** — drag & drop file transfer panel
6. **Plugin Panel** — WASM-hosted custom panels

## Features

### Free (Open Source)

| Feature | Description |
|---------|-------------|
| Grid Terminal | Unlimited split panes, drag & drop, saveable presets, tabs with hover preview |
| Theme Engine | Full CSS themes (not just colors), visual editor, import/export, community gallery |
| Rich Clipboard | Ctrl+C/V images inline in terminal, copy with syntax highlighting, paste tables as CSV/JSON, clipboard history (last 50) |
| Smart Output | Auto-detect JSON → formatted table, CSV → visual table, logs with level colors, clickable links |
| Snippets | Personal command library with interpolable variables (${host}, ${port}), fuzzy search (Ctrl+Shift+P), tags |
| Multiplexer | Persistent sessions, broadcast input, named sessions, quick-switch |

### Pro ($5/month)

| Feature | Description |
|---------|-------------|
| AI Integration | Claude Code & Codex as native grid panels, inline error explanation on hover, contextual command suggestions, natural language → command translation |
| Project Management | File tree with git status, task tracker, parallel agent monitor (real-time), mockup/diff viewer inline |
| SSH Manager | Connection profiles with groups, visual key management, port forwarding UI, SFTP drag & drop, auto-reconnect + health monitor |
| Cloud Sync | Sync settings, snippets, SSH profiles, layouts across machines. Zero-knowledge encrypted |

### Team ($15/seat/month)

| Feature | Description |
|---------|-------------|
| Shared Resources | Shared snippets, SSH profiles, layout presets across team |
| Admin Dashboard | User management, audit log, usage analytics |
| White-label SDK | For B2B partners to customize branding |

## Killer Features (Unique to Azu)

1. **Rich Clipboard** — Ctrl+C/V images in terminal. No terminal does this today.
2. **AI as native grid panel** — not a sidebar, a first-class panel that coexists with terminals in the grid.
3. **Parallel Agent Monitor** — real-time view of what Claude Code / Codex agents are doing in parallel, with diffs and status.
4. **Layout Presets per Workflow** — one click to switch from "trading mode" to "dev mode" to "legal mode".

## Business Strategy

### B2C (Direct)

- Open source core on GitHub → community, contributions, trust
- Pro tier at $5/month — "impulse buy" pricing for devs
- Team tier at $15/seat/month for companies
- Marketing: HackerNews, r/programming, dev Twitter/X, YouTube demos

### B2B (Partnership)

Three paths to AI company partnerships:

1. **White-label license** — Anthropic/OpenAI offers Azu as their "official desktop client" (e.g., "Claude Code Desktop by Azu")
2. **Acquisition target** — Build traction (10K+ users), become an attractive acquisition
3. **Deep integration partnership** — Privileged API access, "Recommended by Anthropic" badge, bundled with Claude Pro

### Revenue Projections

| Phase | Users (Pro) | Teams | Monthly Revenue |
|-------|-------------|-------|-----------------|
| Phase 2 (month 4) | 50 | 0 | $250 |
| Phase 3 (month 6) | 200 | 0 | $1,000 |
| Phase 4 (month 8) | 1,000 | 10 (3 seats avg) | $6,500 |
| Year 1 target | 5,000 | 50 | $32,500 |

Infrastructure costs remain under $500/month even at 10K users (no per-user AI API costs).

## Roadmap

### Phase 1: Terminal Core + Grid (Weeks 1-8)

**Deliverables:**
- Tauri v2 app (Win/Mac/Linux)
- xterm.js with PTY multiplexing
- Flexible grid with drag & drop
- Saveable layout presets
- Theme engine + 5 built-in themes
- Rich clipboard (images)

**Business goals:**
- Open source on GitHub
- Landing page + waitlist
- Launch posts (HN, Reddit)
- Target: 500 stars, 100 active users

### Phase 2: AI Integration + Pro Launch (Weeks 9-16)

**Deliverables:**
- Claude Code as native grid panel
- Codex CLI as native grid panel
- Parallel agent monitor (real-time)
- Mockup/diff viewer inline
- Smart output (JSON/CSV → table)
- Error explanation on hover
- Managed Node runtime

**Business goals:**
- Launch Pro tier ($5/month)
- Stripe/Lemon Squeezy integration
- Demo video "Azu + Claude Code"
- Target: 2K stars, 500 users, 50 Pro

### Phase 3: SSH + Snippets + Polish (Weeks 17-24)

**Deliverables:**
- SSH manager with profiles and groups
- SFTP panel with drag & drop
- Snippet library + fuzzy search
- Command palette (Ctrl+Shift+P)
- Auto-reconnect SSH + health monitoring
- Keybinding customization

**Business goals:**
- B2B pitch deck ready
- Contact Anthropic/OpenAI DevRel
- Target: 5K stars, 200 Pro

### Phase 4: Teams + B2B + Scale (Weeks 25-32)

**Deliverables:**
- Team tier ($15/seat/month)
- Shared snippets, SSH profiles, layouts
- Cloud sync (zero-knowledge encrypted)
- Plugin API + marketplace
- White-label SDK for B2B
- Admin dashboard for teams

**Business goals:**
- Partnership talks with Anthropic/OpenAI
- "Recommended client" badge
- Target: 10K+ stars, 1K Pro, 10 Teams

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop Framework | Tauri v2 | ~5MB installer, ~50-80MB RAM, cross-platform |
| Terminal Engine | xterm.js 5.x + webgl addon | Industry standard, GPU-accelerated rendering |
| PTY | portable-pty (Rust) | Cross-platform, async via tokio |
| Frontend | SolidJS + Vite + UnoCSS | Fastest reactive framework, instant HMR |
| AI Bridge | tokio::process | Async CLI spawning, bidirectional IPC |
| SSH | russh | Pure Rust, async, full SSH2 feature set |
| Database | rusqlite + refinery | Local SQLite, managed migrations |
| Config | TOML + serde + notify | Human-readable, hot-reload |
| Clipboard | arboard + image | Cross-platform rich clipboard (text + images) |
| Plugins | wasmtime (WASM) | Sandboxed, cross-platform, multi-language |
| Runtime | Managed Node.js | Isolated in ~/.azu/runtime/, auto-managed |
| Cloud Sync | Cloudflare R2 | Zero egress, E2E encrypted |
| Auth | Clerk | Free to 10K MAU |
| Payments | Lemon Squeezy | Global tax handling, auto license keys |
| CI/CD | GitHub Actions | Cross-platform builds, Tauri official action |
| Landing | Astro + Vercel | Static, SEO, free hosting |
| Analytics | PostHog | Open-source, feature flags |

## Success Criteria

- Phase 1: Functional cross-platform terminal with grid layout and rich clipboard
- Phase 2: AI CLIs run natively in grid panels with visual monitoring
- Phase 3: SSH management that replaces need for separate tools (Tabby, PuTTY)
- Phase 4: Team features and at least one B2B partnership conversation initiated
- Overall: 10K+ GitHub stars and $5K+/month revenue within 12 months
