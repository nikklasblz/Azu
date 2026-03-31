# Azu Launch Posts — Copy/Paste Ready

## Hacker News (Show HN)

**Title:**
```
Show HN: Azu – 1.8MB AI-native terminal built with Tauri and Rust
```

**Body:**
```
I built a terminal because I got tired of Electron terminals eating 200MB of RAM to display text.

Azu is 1.8MB, GPU-accelerated, and designed for developers who run AI agents (Claude Code, Codex) across multiple projects simultaneously.

Features:
- Grid layout with splits and tabs (like a tiling WM)
- Per-pane working directory saved with layout presets
- Quick-launch Claude Code or Codex in any pane
- 10 built-in themes with per-pane overrides
- Real window transparency (see your code behind the terminal)
- Terminal search, font zoom, command snippets
- State persistence — restores your entire workspace on reopen

Tech stack: Tauri v2 (Rust backend) + SolidJS + xterm.js. No Electron.

For comparison:
- VS Code terminal: ~300MB
- Warp: ~90MB
- Hyper: ~70MB
- Azu: 1.8MB

I named it Azu, after my mother Azucena.

https://github.com/nikklasblz/Azu
https://nikklasblz.github.io/Azu/
```

---

## Reddit r/commandline

**Title:**
```
I built a 1.8MB terminal with grid splits, 10 themes, and AI agent integration [open source]
```

**Body:**
```
Hey r/commandline,

I've been working on Azu, a terminal emulator built specifically for the era of AI coding agents. It's 1.8MB (yes, megabytes — not a typo).

Why I built it:
- I run Claude Code and Codex across 3-4 projects simultaneously
- Existing terminals don't save per-pane working directories
- I wanted a tiling layout where each pane remembers its project context

What it does:
- Split panes in any direction, each with its own shell + working directory
- Save your entire workspace layout as a preset (directories, labels, themes)
- Quick-launch AI tools with one click
- 10 built-in themes, per-pane overrides, real transparency
- Terminal search (Ctrl+Shift+F), font zoom (Ctrl+scroll)
- 1.8MB installer, ~30MB RAM usage

Built with Tauri v2 + Rust + SolidJS + xterm.js. Open source.

Named after my mother, Azucena.

Download: https://github.com/nikklasblz/Azu/releases
Source: https://github.com/nikklasblz/Azu
Website: https://nikklasblz.github.io/Azu/
```

---

## Reddit r/rust

**Title:**
```
Built a terminal emulator in Tauri + Rust that's 50x smaller than Electron alternatives (1.8MB)
```

**Body:**
```
Wanted to share Azu, a terminal I built with Tauri v2 + Rust.

The Rust side handles:
- PTY management via portable-pty (spawn, read, write, resize)
- Rich clipboard with arboard (text + images)
- Window opacity via raw Win32 API (SetLayeredWindowAttributes)
- Process exit code tracking for agent chaining
- Config persistence

Frontend is SolidJS + xterm.js with WebGL rendering.

Some numbers:
- Release binary: 4.9MB
- NSIS installer: 1.8MB
- Idle RAM: ~30MB
- 30 Rust tests

The grid layout system, theme engine, and preset persistence are all handled on the frontend. Rust does the heavy lifting for system interaction.

Source: https://github.com/nikklasblz/Azu

Happy to answer any Rust/Tauri architecture questions.
```

---

## Reddit r/ClaudeAI

**Title:**
```
I built a terminal specifically designed for running Claude Code across multiple projects
```

**Body:**
```
If you run Claude Code on multiple projects, you know the pain of switching terminals, losing context, and not remembering which terminal is on which project.

Azu solves this:
- Split your screen into panes, each pointing to a different project
- One-click launch Claude Code in any or all panes
- Save the layout as a preset: "Work Setup" = 4 panes, 4 projects, ready to go
- Each pane remembers its directory across app restarts

It's 1.8MB and open source.

Quick demo of the workflow:
1. Open Azu
2. Split into 4 panes (Ctrl+Shift+H/V)
3. Set each pane to a different project folder
4. Click "▶ All" → Claude Code launches in all 4 panes
5. Save as "My Workflow" preset
6. Tomorrow: load preset → everything restored → click ▶ All → back to work

https://github.com/nikklasblz/Azu
```

---

## Twitter/X Thread

```
🧵 I built a terminal in a weekend.

It's 1.8MB.
It has 10 themes.
It runs Claude Code and Codex.
It saves your entire workspace.

And I named it after my mom.

Here's the story ↓
```

```
1/ The problem: I run AI agents across 3-4 projects.

Every terminal I tried was either:
- 300MB of Electron (VS Code)
- Missing per-pane project context (Windows Terminal)
- Closed source (Warp)

So I built my own.
```

```
2/ Meet Azu.

Grid layout: split in any direction
Each pane: its own shell + project directory
Presets: save everything, restore with Alt+1

Built with Tauri + Rust. No Electron.
```

```
3/ The size comparison speaks for itself:

VS Code terminal: ~300MB
Warp: ~90MB
Hyper: ~70MB
Windows Terminal: ~30MB
Azu: 1.8MB

That's not a typo. One point eight megabytes.
```

```
4/ AI-native features:

▶ Launch Claude Code in any pane with one click
▶ Launch in ALL panes simultaneously
⚡ Command snippets for frequent commands
🔍 Terminal search (Ctrl+Shift+F)
📋 Paste images directly (saved as temp file for AI tools)
```

```
5/ 10 built-in themes including "Azu Orange" inspired by the Claude app.

Each pane can have its own theme.
Real window transparency (see your desktop behind).
Auto-contrast adapts to any theme.
```

```
6/ Why "Azu"?

Short for Azucena — my mother's name.
It means "lily" in Spanish.

The logo is a stylized lily flower.
```

```
7/ It's open source and free.

Download (Windows): https://github.com/nikklasblz/Azu/releases
Source code: https://github.com/nikklasblz/Azu
Website: https://nikklasblz.github.io/Azu/

Star ⭐ if you think terminals should be lighter.
```

---

## Dev.to / Hashnode Article

**Title:**
```
How I Built a 1.8MB Terminal for AI Agents with Tauri and Rust
```

**See separate file: docs/marketing/devto-article.md**

---

## Video Script (60 seconds)

**[0-5s]** Black screen → "1.8MB" fades in large → "That's a terminal."

**[5-15s]** Azu opens. Clean dark theme. Single pane. Text: "Meet Azu."

**[15-25s]** Ctrl+Shift+H, Ctrl+Shift+V → 4 panes appear. Click folder on each → assign projects. Text: "Split. Assign. Organize."

**[25-35s]** Click ▶ All → Claude Code launches in all 4 panes simultaneously. Text: "Launch AI agents everywhere."

**[35-42s]** Open theme picker → cycle through 3-4 themes quickly. Text: "10 themes. Per-pane customization."

**[42-48s]** Save preset → close Azu → reopen → preset restores. Text: "Your workspace. Saved."

**[48-55s]** Side-by-side size comparison animation. Azu bar tiny vs others. Text: "50x lighter than Electron."

**[55-60s]** Logo + "Azu — The terminal for AI agents" + GitHub link + "Star ⭐ on GitHub"
