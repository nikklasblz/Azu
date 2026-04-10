import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { listen } from '@tauri-apps/api/event'
import { ssh as sshCmd } from '../lib/tauri-commands'

export interface SshHost {
  id: string
  name: string
  host: string
  user: string
  port: number
  keyPath?: string
  source: 'ssh-config' | 'azu'
}

export interface SshConnection {
  id: string
  hostId: string
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  host: string
  user: string
  connectedAt?: string
}

const [hosts, setHosts] = createSignal<SshHost[]>([])
const [connections, setConnections] = createStore<Record<string, SshConnection>>({})

export { hosts, connections }

export async function loadHosts(): Promise<void> {
  try {
    const result = await sshCmd.listHosts()
    setHosts(result as SshHost[])
  } catch {
    setHosts([])
  }
}

export async function addHost(host: Omit<SshHost, 'id'>): Promise<SshHost[]> {
  const result = await sshCmd.addHost(host)
  const updated = result as SshHost[]
  setHosts(updated)
  return updated
}

export async function removeHost(hostId: string): Promise<SshHost[]> {
  const result = await sshCmd.removeHost(hostId)
  const updated = result as SshHost[]
  setHosts(updated)
  return updated
}

export async function connectSsh(
  hostId: string,
  password: string | null,
  rows: number,
  cols: number
): Promise<string> {
  const connectionId = await sshCmd.connect(hostId, password, rows, cols)
  return connectionId
}

export async function disconnectSsh(connectionId: string): Promise<void> {
  await sshCmd.disconnect(connectionId)
  setConnections(connectionId, 'status', 'disconnected')
}

export function getActiveConnectionCount(): number {
  return Object.values(connections).filter(c => c.status === 'connected').length
}

export function initSshListeners() {
  listen<SshConnection>('ssh-status', (e) => {
    const info = e.payload
    setConnections(info.id, {
      id: info.id,
      hostId: info.hostId,
      status: info.status,
      host: info.host,
      user: info.user,
      connectedAt: info.connectedAt,
    })
  })
}
