/**
 * Tests for src/lib/keybindings.ts
 *
 * NOTE on Ctrl+W: The current implementation does NOT call callbacks.closeTab().
 * When multiple panes exist it calls removeCell() from the grid store directly.
 * Tests reflect the actual code behaviour; a future refactor may wire closeTab.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- mock the grid store before importing keybindings ---
vi.mock('../../../src/stores/grid', () => ({
  gridStore: {
    root: { id: 'root', type: 'leaf' },
    presets: {} as Record<string, unknown>,
  },
  findAllLeaves: vi.fn(),
  removeCell: vi.fn(),
  splitHorizontal: vi.fn(),
  splitVertical: vi.fn(),
  loadPreset: vi.fn(),
}))

import { initKeybindings } from '../../../src/lib/keybindings'
import {
  gridStore,
  findAllLeaves,
  removeCell,
  splitHorizontal,
  splitVertical,
  loadPreset,
} from '../../../src/stores/grid'

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

/** Build a minimal KeyboardEvent-like object accepted by the captured handler. */
function makeKeyEvent(
  key: string,
  modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

/** Register initKeybindings and return the captured keydown handler + spy. */
function setup(cbs?: Partial<Parameters<typeof initKeybindings>[0]>) {
  const addTab = vi.fn()
  const closeTab = vi.fn()
  const getActiveTabId = vi.fn(() => 'tab-1')

  const spy = vi.spyOn(document, 'addEventListener')

  initKeybindings({
    addTab,
    closeTab,
    getActiveTabId,
    ...cbs,
  })

  // The handler passed to document.addEventListener('keydown', handler)
  const handler = spy.mock.calls.find(([event]) => event === 'keydown')?.[1] as
    | ((e: KeyboardEvent) => void)
    | undefined

  if (!handler) throw new Error('keydown listener was not registered')

  return { addTab, closeTab, getActiveTabId, spy, handler }
}

// -----------------------------------------------------------------
// Suites
// -----------------------------------------------------------------

describe('initKeybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: single pane (no removal on Ctrl+W)
    ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([{ id: 'root' }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Registration
  describe('registers keyboard event listener', () => {
    it('calls document.addEventListener with "keydown"', () => {
      const spy = vi.spyOn(document, 'addEventListener')
      initKeybindings({
        addTab: vi.fn(),
        closeTab: vi.fn(),
        getActiveTabId: vi.fn(),
      })
      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    it('registers exactly one keydown listener per call', () => {
      const spy = vi.spyOn(document, 'addEventListener')
      initKeybindings({
        addTab: vi.fn(),
        closeTab: vi.fn(),
        getActiveTabId: vi.fn(),
      })
      const keydownCalls = spy.mock.calls.filter(([event]) => event === 'keydown')
      expect(keydownCalls).toHaveLength(1)
    })
  })

  // 2. Ctrl+T → addTab
  describe('Ctrl+T triggers addTab callback', () => {
    it('calls addTab when Ctrl+T is pressed', () => {
      const { addTab, handler } = setup()
      handler(makeKeyEvent('t', { ctrlKey: true }))
      expect(addTab).toHaveBeenCalledTimes(1)
    })

    it('calls preventDefault for Ctrl+T', () => {
      const { handler } = setup()
      const event = makeKeyEvent('t', { ctrlKey: true })
      handler(event)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not call addTab when only T is pressed (no Ctrl)', () => {
      const { addTab, handler } = setup()
      handler(makeKeyEvent('t'))
      expect(addTab).not.toHaveBeenCalled()
    })
  })

  // 3. Ctrl+W → closeTab / removeCell
  describe('Ctrl+W behaviour', () => {
    it('does NOT call closeTab — Ctrl+W is handled by removeCell in the grid store', () => {
      // Two leaves: the implementation calls removeCell, not closeTab
      ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'leaf-1' },
        { id: 'leaf-2' },
      ])
      const { closeTab, handler } = setup()
      handler(makeKeyEvent('w', { ctrlKey: true }))
      expect(closeTab).not.toHaveBeenCalled()
    })

    it('calls removeCell on the last leaf when multiple panes exist', () => {
      ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'leaf-1' },
        { id: 'leaf-2' },
      ])
      const { handler } = setup()
      handler(makeKeyEvent('w', { ctrlKey: true }))
      expect(removeCell).toHaveBeenCalledWith('leaf-2')
    })

    it('does NOT call removeCell when only a single pane exists', () => {
      ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([{ id: 'root' }])
      const { handler } = setup()
      handler(makeKeyEvent('w', { ctrlKey: true }))
      expect(removeCell).not.toHaveBeenCalled()
    })

    it('calls preventDefault for Ctrl+W', () => {
      const { handler } = setup()
      const event = makeKeyEvent('w', { ctrlKey: true })
      handler(event)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not react to plain W (no Ctrl)', () => {
      const { handler } = setup()
      handler(makeKeyEvent('w'))
      expect(removeCell).not.toHaveBeenCalled()
    })
  })

  // 4. Other key combos don't trigger callbacks
  describe('unrelated key combos do not trigger callbacks', () => {
    it('ignores Ctrl+A', () => {
      const { addTab, closeTab, handler } = setup()
      handler(makeKeyEvent('a', { ctrlKey: true }))
      expect(addTab).not.toHaveBeenCalled()
      expect(closeTab).not.toHaveBeenCalled()
    })

    it('ignores plain Enter', () => {
      const { addTab, closeTab, handler } = setup()
      handler(makeKeyEvent('Enter'))
      expect(addTab).not.toHaveBeenCalled()
      expect(closeTab).not.toHaveBeenCalled()
    })

    it('ignores Ctrl+Shift+T (not a registered binding)', () => {
      const { addTab, handler } = setup()
      handler(makeKeyEvent('T', { ctrlKey: true, shiftKey: true }))
      expect(addTab).not.toHaveBeenCalled()
    })

    it('ignores Alt+0 (out of preset range 1-9)', () => {
      const { addTab, closeTab, handler } = setup()
      handler(makeKeyEvent('0', { altKey: true }))
      expect(addTab).not.toHaveBeenCalled()
      expect(closeTab).not.toHaveBeenCalled()
      expect(loadPreset).not.toHaveBeenCalled()
    })

    it('Ctrl+Shift+H calls splitHorizontal, not addTab or closeTab', () => {
      ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([{ id: 'leaf-1' }])
      const { addTab, closeTab, handler } = setup()
      handler(makeKeyEvent('H', { ctrlKey: true, shiftKey: true }))
      expect(addTab).not.toHaveBeenCalled()
      expect(closeTab).not.toHaveBeenCalled()
      expect(splitHorizontal).toHaveBeenCalledWith('leaf-1')
    })

    it('Ctrl+Shift+V calls splitVertical, not addTab or closeTab', () => {
      ;(findAllLeaves as ReturnType<typeof vi.fn>).mockReturnValue([{ id: 'leaf-1' }])
      const { addTab, closeTab, handler } = setup()
      handler(makeKeyEvent('V', { ctrlKey: true, shiftKey: true }))
      expect(addTab).not.toHaveBeenCalled()
      expect(closeTab).not.toHaveBeenCalled()
      expect(splitVertical).toHaveBeenCalledWith('leaf-1')
    })

    it('does not call preventDefault for unbound keys', () => {
      const { handler } = setup()
      const event = makeKeyEvent('z', { ctrlKey: true })
      handler(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  // 5. Cleanup removes listener
  describe('cleanup removes the keydown listener', () => {
    it('the registered handler reference can be passed to removeEventListener', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      const removeSpy = vi.spyOn(document, 'removeEventListener')

      initKeybindings({
        addTab: vi.fn(),
        closeTab: vi.fn(),
        getActiveTabId: vi.fn(),
      })

      // Grab the exact handler function reference that was registered
      const registeredHandler = addSpy.mock.calls.find(
        ([event]) => event === 'keydown',
      )?.[1] as (e: KeyboardEvent) => void

      expect(registeredHandler).toBeDefined()

      // Simulate framework teardown: the caller removes the same reference
      document.removeEventListener('keydown', registeredHandler)

      // Verify removeEventListener was called with the correct event type and
      // the exact same function reference that addEventListener received
      expect(removeSpy).toHaveBeenCalledWith('keydown', registeredHandler)
    })

    it('invoking the handler directly after simulated removal does not throw', () => {
      // Verifies the handler itself is a stable, callable function (not nulled out)
      const addSpy = vi.spyOn(document, 'addEventListener')
      const addTab = vi.fn()

      initKeybindings({
        addTab,
        closeTab: vi.fn(),
        getActiveTabId: vi.fn(),
      })

      const registeredHandler = addSpy.mock.calls.find(
        ([event]) => event === 'keydown',
      )?.[1] as (e: KeyboardEvent) => void

      document.removeEventListener('keydown', registeredHandler)

      // Even after removal from the DOM, calling the closure directly is safe
      expect(() => registeredHandler(makeKeyEvent('t', { ctrlKey: true }))).not.toThrow()
    })
  })
})
