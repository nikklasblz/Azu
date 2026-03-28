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
