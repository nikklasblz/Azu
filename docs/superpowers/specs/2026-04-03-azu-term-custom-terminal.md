# Azu Terminal Core (azu-term) — Custom Terminal Emulator

## Problema

xterm.js funciona bien como emulador, pero su ciclo de vida está acoplado al DOM. Cuando SolidJS destruye y recrea el DOM (splits, tabs), xterm.js pierde su estado interno, event listeners, y canvas. Todos los intentos de cache/serialize/pool han fallado porque xterm.js no fue diseñado para sobrevivir destrucción del DOM.

## Solución

Terminal emulador propio en TypeScript con arquitectura **estado separado del render**:
- El estado (buffer, cursor, parser) vive en memoria JS — independiente del DOM
- El renderer solo pinta a un `<canvas>` — si el canvas se destruye, se crea otro y se repinta
- `attach(container)` / `detach()` permiten mover el terminal entre containers sin perder estado

## Arquitectura

```
AzuTerminal (clase principal)
├── AnsiParser     — state machine que interpreta escape sequences
├── TerminalBuffer — grid de caracteres + scrollback + cursor
├── CanvasRenderer — pinta buffer a canvas 2D
└── InputHandler   — keyboard events → bytes PTY
```

### Flujo de datos

```
PTY output (bytes)
  → AnsiParser.parse(data)
    → modifica TerminalBuffer (cells, cursor, scroll)
      → CanvasRenderer.render(buffer)
        → canvas 2D pintado
        
Keyboard event
  → InputHandler.handleKey(event)
    → bytes enviados al PTY via onData callback
```

### API pública

```typescript
class AzuTerminal {
  constructor(options: { cols: number, rows: number, fontSize?: number, fontFamily?: string })
  
  // Lifecycle — clave para resolver el problema del split
  attach(container: HTMLElement): void   // crea canvas, bindea eventos, pinta
  detach(): void                         // remueve canvas, unbindea, MANTIENE estado
  dispose(): void                        // destruye todo
  
  // Data
  write(data: string): void             // PTY output → parser → buffer → render
  onData: (callback: (data: string) => void) => void  // keyboard → PTY input
  
  // Layout
  resize(cols: number, rows: number): void
  fit(): { cols: number, rows: number }  // calcula cols/rows del container
  
  // Features
  getSelection(): string
  focus(): void
  
  // Theming
  setTheme(theme: TerminalTheme): void
}
```

### Ventaja sobre xterm.js

| | xterm.js | azu-term |
|---|---------|----------|
| Estado | En el DOM (canvas) | En memoria (TerminalBuffer) |
| Re-mount | Destruye estado | `detach()` + `attach()` — sin pérdida |
| Split | Terminal se reinicia | Terminal se repinta instantáneamente |
| Dependencia | 200KB+ con addons | ~15KB estimado |

## Alcance — Fase 1 (MVP)

Solo lo necesario para reemplazar xterm.js en Azu:

1. **ANSI parser**: SGR (colores/estilos), cursor movement (CUU/CUD/CUF/CUB/CUP), erase (ED/EL), scroll, newline/CR
2. **Buffer**: grid cols×rows, scrollback 1000 líneas, cursor position/visibility
3. **Renderer**: canvas 2D, monospace font, 16 colores ANSI + 256 + truecolor, cursor block
4. **Input**: standard keys, Ctrl combos, Enter/Backspace/Tab/Escape/arrows
5. **Integration**: reemplazar xterm.js en GridCell.tsx

### NO incluido en Fase 1
- Mouse tracking
- Alternate screen buffer (vim, less)
- Sixel/images
- Ligatures
- IME
- Search/find
- Selection/copy

Estos se agregan incrementalmente después del MVP.

## Archivos

```
src/terminal/
├── parser.ts        — ANSI escape sequence state machine
├── buffer.ts        — TerminalBuffer: cell grid + scrollback + cursor
├── renderer.ts      — CanvasRenderer: pinta buffer a canvas 2D
├── input.ts         — InputHandler: keyboard → PTY bytes
├── terminal.ts      — AzuTerminal: clase principal, combina todo
├── types.ts         — tipos compartidos (Cell, CursorState, Theme, etc.)
└── index.ts         — export público

tests/frontend/terminal/
├── parser.test.ts   — tests del parser ANSI
├── buffer.test.ts   — tests del buffer
├── renderer.test.ts — tests del renderer (mock canvas)
├── input.test.ts    — tests del input handler
└── terminal.test.ts — tests de integración
```

## Distribución por agentes

Los componentes son independientes — se pueden desarrollar en paralelo:

| Agente | Componente | Dependencias |
|--------|-----------|-------------|
| 1 | `types.ts` + `parser.ts` | Ninguna |
| 2 | `buffer.ts` | types.ts |
| 3 | `renderer.ts` | types.ts, buffer.ts |
| 4 | `input.ts` | types.ts |
| 5 | `terminal.ts` + integración | Todos los anteriores |

Agentes 1-4 en paralelo, Agente 5 secuencial después.
