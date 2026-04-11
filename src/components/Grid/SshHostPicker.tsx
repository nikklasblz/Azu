import { Component, createSignal, onMount, For, Show } from 'solid-js'
import { SshHost, hosts, loadHosts, addHost, connectSsh } from '../../stores/ssh'
import { setCellSsh } from '../../stores/grid'

interface SshHostPickerProps {
  cellId: string
  colors: any
  onClose: () => void
  onConnected: (connectionId: string) => void
}

const SshHostPicker: Component<SshHostPickerProps> = (props) => {
  const [connecting, setConnecting] = createSignal<string | null>(null)
  const [needsPassword, setNeedsPassword] = createSignal<string | null>(null)
  const [password, setPassword] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)

  // AWS discovery state
  const [awsHosts, setAwsHosts] = createSignal<SshHost[]>([])
  const [awsLoading, setAwsLoading] = createSignal(false)
  const [awsError, setAwsError] = createSignal('')

  // Add new host form state
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [newHost, setNewHost] = createSignal('')
  const [newUser, setNewUser] = createSignal('')
  const [newPort, setNewPort] = createSignal('22')
  const [newKeyPath, setNewKeyPath] = createSignal('')
  const [newName, setNewName] = createSignal('')
  const [addError, setAddError] = createSignal<string | null>(null)
  const [adding, setAdding] = createSignal(false)

  onMount(() => {
    loadHosts()
  })

  const sshConfigHosts = () => hosts().filter(h => h.source === 'ssh-config')
  const azuHosts = () => hosts().filter(h => h.source === 'azu')

  const doConnect = async (hostId: string, pwd: string | null) => {
    setConnecting(hostId)
    setError(null)
    try {
      const connectionId = await connectSsh(hostId, pwd, 24, 80)
      setCellSsh(props.cellId, { hostId, connectionId })
      props.onConnected(connectionId)
      props.onClose()
    } catch (e: any) {
      const msg = String(e)
      if (msg.toLowerCase().includes('authentication')) {
        setNeedsPassword(hostId)
        setPassword('')
      } else {
        setError(msg)
      }
    } finally {
      setConnecting(null)
    }
  }

  const handleHostClick = (hostId: string) => {
    if (needsPassword() === hostId) return
    setNeedsPassword(null)
    doConnect(hostId, null)
  }

  const handlePasswordSubmit = (hostId: string) => {
    doConnect(hostId, password())
  }

  const handleAddHost = async () => {
    if (!newHost().trim() || !newUser().trim()) {
      setAddError('Host and user are required')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await addHost({
        name: newName().trim() || newHost().trim(),
        host: newHost().trim(),
        user: newUser().trim(),
        port: parseInt(newPort()) || 22,
        keyPath: newKeyPath().trim() || undefined,
        source: 'azu',
      })
      setShowAddForm(false)
      setNewHost('')
      setNewUser('')
      setNewPort('22')
      setNewKeyPath('')
      setNewName('')
    } catch (e: any) {
      setAddError(String(e))
    } finally {
      setAdding(false)
    }
  }

  const inputStyle = () => ({
    background: props.colors.surface,
    color: props.colors.text,
    border: `1px solid ${props.colors.border}`,
    'border-radius': '3px',
    padding: '3px 6px',
    'font-size': '11px',
    width: '100%',
    outline: 'none',
    'box-sizing': 'border-box' as const,
  })

  const labelStyle = () => ({
    color: props.colors.textMuted,
    'font-size': '10px',
    'margin-bottom': '2px',
    display: 'block',
  })

  const HostRow: Component<{ host: SshHost }> = (rowProps) => {
    const isConnecting = () => connecting() === rowProps.host.id
    const isPwdNeeded = () => needsPassword() === rowProps.host.id

    return (
      <div>
        <button
          class="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 flex items-center justify-between"
          style={{ color: props.colors.text, opacity: isConnecting() ? '0.6' : '1' }}
          onClick={() => handleHostClick(rowProps.host.id)}
          disabled={isConnecting()}
        >
          <span style={{ 'font-family': 'monospace' }}>
            {rowProps.host.user}@{rowProps.host.name}
          </span>
          <span style={{ color: props.colors.textMuted, 'font-size': '10px' }}>
            :{rowProps.host.port}
          </span>
          <Show when={isConnecting()}>
            <span style={{ color: props.colors.textMuted, 'font-size': '10px', 'margin-left': '6px' }}>
              ...
            </span>
          </Show>
        </button>
        <Show when={isPwdNeeded()}>
          <div style={{ padding: '4px 12px 8px' }}>
            <label style={labelStyle()}>Password required</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                type="password"
                value={password()}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordSubmit(rowProps.host.id)
                  if (e.key === 'Escape') setNeedsPassword(null)
                }}
                placeholder="Enter password..."
                style={{ ...inputStyle(), flex: '1' }}
                autofocus
              />
              <button
                onClick={() => handlePasswordSubmit(rowProps.host.id)}
                style={{
                  background: props.colors.accent,
                  color: props.colors.surface,
                  border: 'none',
                  'border-radius': '3px',
                  padding: '3px 8px',
                  'font-size': '11px',
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: '0',
        'margin-top': '2px',
        'z-index': '60',
        background: props.colors.surface,
        border: `1px solid ${props.colors.border}`,
        'border-radius': '4px',
        width: '240px',
        'box-shadow': '0 4px 12px rgba(0,0,0,0.4)',
        'max-height': '320px',
        'overflow-y': 'auto',
      }}
    >
      <div style={{ padding: '6px 12px 4px', color: props.colors.textMuted, 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '0.08em' }}>
        SSH Hosts
      </div>

      <Show when={error()}>
        <div style={{ padding: '4px 12px', color: props.colors.error, 'font-size': '11px' }}>
          {error()}
        </div>
      </Show>

      {/* SSH Config hosts */}
      <Show when={sshConfigHosts().length > 0}>
        <div style={{ padding: '2px 12px', color: props.colors.textMuted, 'font-size': '10px' }}>
          from ~/.ssh/config
        </div>
        <For each={sshConfigHosts()}>
          {(host) => <HostRow host={host} />}
        </For>
      </Show>

      {/* Azu hosts */}
      <Show when={azuHosts().length > 0}>
        <Show when={sshConfigHosts().length > 0}>
          <div style={{ height: '1px', background: props.colors.border, margin: '4px 0' }} />
        </Show>
        <div style={{ padding: '2px 12px', color: props.colors.textMuted, 'font-size': '10px' }}>
          saved in Azu
        </div>
        <For each={azuHosts()}>
          {(host) => <HostRow host={host} />}
        </For>
      </Show>

      <Show when={hosts().length === 0 && awsHosts().length === 0}>
        <div style={{ padding: '8px 12px', color: props.colors.textMuted, 'font-size': '11px' }}>
          No hosts found
        </div>
      </Show>

      {/* AWS Lightsail hosts */}
      <Show when={awsHosts().length > 0}>
        <Show when={hosts().length > 0}>
          <div style={{ height: '1px', background: props.colors.border, margin: '4px 0' }} />
        </Show>
        <div style={{ padding: '2px 12px', color: props.colors.textMuted, 'font-size': '10px' }}>
          AWS Lightsail
        </div>
        <For each={awsHosts()}>
          {(host) => <HostRow host={host} />}
        </For>
      </Show>

      {/* Divider */}
      <div style={{ height: '1px', background: props.colors.border, margin: '4px 0' }} />

      {/* Scan AWS Lightsail */}
      <button
        onClick={async () => {
          setAwsLoading(true)
          setAwsError('')
          try {
            const { ssh: sshCmd } = await import('../../lib/tauri-commands')
            const instances = await sshCmd.awsLightsailDiscover()
            setAwsHosts(instances)
          } catch (e: any) {
            setAwsError(String(e))
          }
          setAwsLoading(false)
        }}
        disabled={awsLoading()}
        style={{
          width: '100%',
          padding: '4px 6px',
          background: 'transparent',
          border: `1px dashed ${props.colors.border}`,
          'border-radius': '3px',
          color: props.colors.accent,
          'font-size': '10px',
          cursor: 'pointer',
          'margin-top': '4px',
          opacity: awsLoading() ? '0.5' : '1',
        }}
      >
        {awsLoading() ? 'Scanning...' : '☁ Scan AWS Lightsail'}
      </button>

      <Show when={awsError()}>
        <div style={{ padding: '2px 6px', color: props.colors.error, 'font-size': '9px' }}>{awsError()}</div>
      </Show>

      {/* Divider before Add new host */}
      <div style={{ height: '1px', background: props.colors.border, margin: '4px 0' }} />

      {/* Add new host */}
      <Show when={!showAddForm()}>
        <button
          class="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10"
          style={{ color: props.colors.accent }}
          onClick={() => setShowAddForm(true)}
        >
          + Add new host
        </button>
      </Show>

      <Show when={showAddForm()}>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ color: props.colors.text, 'font-size': '11px', 'font-weight': '600', 'margin-bottom': '6px' }}>
            Add Host
          </div>

          <div style={{ 'margin-bottom': '4px' }}>
            <label style={labelStyle()}>Name (optional)</label>
            <input
              type="text"
              value={newName()}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              placeholder="my-server"
              style={inputStyle()}
            />
          </div>

          <div style={{ 'margin-bottom': '4px' }}>
            <label style={labelStyle()}>Host *</label>
            <input
              type="text"
              value={newHost()}
              onInput={(e) => setNewHost((e.target as HTMLInputElement).value)}
              placeholder="192.168.1.1 or example.com"
              style={inputStyle()}
              autofocus
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '4px' }}>
            <div style={{ flex: '1' }}>
              <label style={labelStyle()}>User *</label>
              <input
                type="text"
                value={newUser()}
                onInput={(e) => setNewUser((e.target as HTMLInputElement).value)}
                placeholder="ubuntu"
                style={inputStyle()}
              />
            </div>
            <div style={{ width: '60px' }}>
              <label style={labelStyle()}>Port</label>
              <input
                type="number"
                value={newPort()}
                onInput={(e) => setNewPort((e.target as HTMLInputElement).value)}
                style={inputStyle()}
              />
            </div>
          </div>

          <div style={{ 'margin-bottom': '8px' }}>
            <label style={labelStyle()}>Key path (optional)</label>
            <input
              type="text"
              value={newKeyPath()}
              onInput={(e) => setNewKeyPath((e.target as HTMLInputElement).value)}
              placeholder="~/.ssh/id_rsa"
              style={inputStyle()}
            />
          </div>

          <Show when={addError()}>
            <div style={{ color: props.colors.error, 'font-size': '10px', 'margin-bottom': '4px' }}>
              {addError()}
            </div>
          </Show>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleAddHost}
              disabled={adding()}
              style={{
                flex: '1',
                background: props.colors.accent,
                color: props.colors.surface,
                border: 'none',
                'border-radius': '3px',
                padding: '4px 0',
                'font-size': '11px',
                cursor: 'pointer',
                'font-weight': '600',
                opacity: adding() ? '0.6' : '1',
              }}
            >
              {adding() ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddError(null) }}
              style={{
                flex: '1',
                background: 'transparent',
                color: props.colors.textMuted,
                border: `1px solid ${props.colors.border}`,
                'border-radius': '3px',
                padding: '4px 0',
                'font-size': '11px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default SshHostPicker
