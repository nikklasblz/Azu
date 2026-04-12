import { Component, Show, createSignal } from 'solid-js'
import { open } from '@tauri-apps/plugin-shell'
import { proEnabled, licenseInfo, licenseError, activateLicense, deactivateLicense } from '../../stores/license'

interface LicensePanelProps {
  colors: any
  onClose: () => void
}

const STRIPE_URL = 'https://buy.stripe.com/REPLACE'

const LicensePanel: Component<LicensePanelProps> = (props) => {
  const [keyInput, setKeyInput] = createSignal('')
  const [activating, setActivating] = createSignal(false)
  const [deactivating, setDeactivating] = createSignal(false)

  const c = () => props.colors || {}

  const handleActivate = async () => {
    const key = keyInput().trim()
    if (!key) return
    setActivating(true)
    await activateLicense(key)
    setActivating(false)
  }

  const handleDeactivate = async () => {
    setDeactivating(true)
    await deactivateLicense()
    setDeactivating(false)
  }

  const handleBuyPro = () => {
    open(STRIPE_URL)
  }

  const info = () => licenseInfo()

  return (
    <div
      class="absolute z-50 rounded shadow-2xl p-4 flex flex-col gap-3"
      style={{
        top: '44px',
        right: '8px',
        width: '280px',
        background: c().surface || '#0d1117',
        border: `1px solid ${c().border || '#30363d'}`,
        'box-shadow': '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div class="flex items-center justify-between">
        <span
          class="text-xs font-semibold uppercase tracking-widest"
          style={{ color: c().accent || '#58a6ff' }}
        >
          Azu Pro
        </span>
        <button
          class="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition-colors"
          style={{ color: c().textMuted || '#8b949e', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={props.onClose}
          title="Close"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="2" y1="2" x2="8" y2="8"/>
            <line x1="8" y1="2" x2="2" y2="8"/>
          </svg>
        </button>
      </div>

      {/* Active license info */}
      <Show
        when={proEnabled()}
        fallback={
          <div class="flex flex-col gap-2">
            <p class="text-[11px]" style={{ color: c().textMuted || '#8b949e' }}>
              Enter your license key to activate Pro features.
            </p>
            <input
              type="text"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={keyInput()}
              onInput={(e) => setKeyInput((e.target as HTMLInputElement).value)}
              class="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                background: c().surfaceAlt || '#161b22',
                border: `1px solid ${c().border || '#30363d'}`,
                color: c().text || '#c9d1d9',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
            />
            <Show when={licenseError()}>
              <p class="text-[10px]" style={{ color: c().error || '#f85149' }}>
                {licenseError()}
              </p>
            </Show>
            <button
              class="w-full py-1.5 rounded text-xs font-medium transition-opacity"
              style={{
                background: c().accent || '#58a6ff',
                color: c().surface || '#0d1117',
                border: 'none',
                cursor: activating() ? 'not-allowed' : 'pointer',
                opacity: activating() ? '0.6' : '1',
              }}
              onClick={handleActivate}
              disabled={activating()}
            >
              {activating() ? 'Activating…' : 'Activate'}
            </button>
          </div>
        }
      >
        <div class="flex flex-col gap-1.5">
          <Show when={info()}>
            <div class="flex flex-col gap-0.5">
              <div class="flex justify-between items-center">
                <span class="text-[10px]" style={{ color: c().textMuted || '#8b949e' }}>Email</span>
                <span class="text-[11px] font-mono" style={{ color: c().text || '#c9d1d9' }}>{info()?.email}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[10px]" style={{ color: c().textMuted || '#8b949e' }}>Plan</span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: c().accent || '#58a6ff', color: c().surface || '#0d1117' }}
                >
                  {info()?.plan}
                </span>
              </div>
            </div>
          </Show>
          <button
            class="w-full py-1.5 rounded text-xs transition-opacity mt-1"
            style={{
              background: 'transparent',
              border: `1px solid ${c().border || '#30363d'}`,
              color: c().textMuted || '#8b949e',
              cursor: deactivating() ? 'not-allowed' : 'pointer',
              opacity: deactivating() ? '0.5' : '1',
            }}
            onClick={handleDeactivate}
            disabled={deactivating()}
          >
            {deactivating() ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </Show>

      {/* Buy Pro — always visible */}
      <div style={{ 'border-top': `1px solid ${c().border || '#30363d'}`, 'padding-top': '8px' }}>
        <button
          class="w-full py-1.5 rounded text-xs font-medium transition-opacity"
          style={{
            background: 'transparent',
            border: `1px solid ${c().accent || '#58a6ff'}`,
            color: c().accent || '#58a6ff',
            cursor: 'pointer',
          }}
          onClick={handleBuyPro}
        >
          Buy Pro
        </button>
      </div>
    </div>
  )
}

export default LicensePanel
