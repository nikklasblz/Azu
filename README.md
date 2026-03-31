# Azu — AI-Native Terminal

[![Download](https://img.shields.io/github/downloads/nikklasblz/Azu/total?style=flat-square&color=58a6ff&label=downloads)](https://github.com/nikklasblz/Azu/releases)
[![Size](https://img.shields.io/badge/size-1.8MB-3fb950?style=flat-square)](https://github.com/nikklasblz/Azu/releases)
[![License](https://img.shields.io/github/license/nikklasblz/Azu?style=flat-square&color=8b949e)](LICENSE)
[![Stars](https://img.shields.io/github/stars/nikklasblz/Azu?style=flat-square&color=ffd700)](https://github.com/nikklasblz/Azu)

**The terminal built for the age of AI agents.** 1.8MB. 10 themes. GPU-accelerated. Open source.

Run Claude Code, Codex, and any CLI tool in a flexible grid layout with per-pane project context.

**[Download](https://github.com/nikklasblz/Azu/releases) · [Website](https://nikklasblz.github.io/Azu/) · [Report Bug](https://github.com/nikklasblz/Azu/issues)**

**Built with:** Tauri v2 + SolidJS + xterm.js + Rust

## Features

**Grid Terminal**
- Split panes horizontally/vertically, resize freely
- Swap pane positions via dropdown
- Per-pane working directory saved with layouts
- Drag tabs to reorder

**AI-Ready**
- Quick-launch buttons: Claude, Claude (yolo), Codex, Codex (full-auto)
- Launch CLI in all panes simultaneously
- Environment detection panel (Python, Node, Claude, Codex, Git...)
- Image paste to file for AI tools

**Themes & Customization**
- 9 built-in themes (dark + light)
- Per-pane theme overrides
- Real window transparency (see desktop behind)
- Auto-contrast toolbar adapts to any theme
- Font zoom (Ctrl+=/-)

**Productivity**
- Layout presets — save/load/update/delete
- State persistence — restores on reopen
- Terminal search (Ctrl+Shift+F)
- Command snippets — save frequent commands
- Keyboard shortcuts for everything

**Lightweight**
- ~5MB binary (vs ~150MB Electron apps)
- GPU-accelerated rendering (WebGL)
- Native performance via Rust backend

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close pane |
| `Ctrl+Shift+H` | Split horizontal |
| `Ctrl+Shift+V` | Split vertical |
| `Ctrl+Shift+F` | Search in terminal |
| `Ctrl+=` / `Ctrl+-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Alt+1-9` | Load preset by position |

## Install

### From Release

Download the latest `.msi` (Windows) from [Releases](https://github.com/nikklasblz/Azu/releases).

### Build from Source

```bash
# Prerequisites: Node.js 18+, Rust 1.77+
git clone https://github.com/nikklasblz/Azu.git
cd Azu
npm install
npx tauri build
```

The installer is generated in `src-tauri/target/release/bundle/`.

## Development

```bash
npm install
npx tauri dev
```

## Architecture

```
src/                  # SolidJS frontend
  components/
    Grid/             # Pane grid system
    Terminal/          # xterm.js wrapper
    TitleBar/          # Window controls + snippets
    ThemePicker/       # Theme selector
    StatusBar/         # Status + environment detection
  stores/             # SolidJS reactive stores
    grid.ts           # Grid layout tree
    theme.ts          # Theme engine
  themes/             # 9 built-in themes
  lib/
    tauri-commands.ts  # Rust bridge
    keybindings.ts     # Keyboard shortcuts

src-tauri/            # Rust backend
  src/
    pty/              # PTY management (portable-pty)
    clipboard/        # Rich clipboard (text + images)
    commands/         # Tauri command handlers
```

## License

MIT
