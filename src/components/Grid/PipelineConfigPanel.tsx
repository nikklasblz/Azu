import { Component, createSignal } from 'solid-js'
import { PipelineNodeConfig, setCellPipeline } from '../../stores/grid'

interface PipelineConfigPanelProps {
  cellId: string
  pipeline?: PipelineNodeConfig
  colors: any
  onClose: () => void
}

const PipelineConfigPanel: Component<PipelineConfigPanelProps> = (props) => {
  const initial = () => props.pipeline

  const [command, setCommand] = createSignal(initial()?.command ?? '')
  const [prompt, setPrompt] = createSignal(initial()?.prompt ?? '')
  const [trigger, setTrigger] = createSignal<'auto' | 'manual'>(initial()?.trigger ?? 'manual')
  const [pipeMode, setPipeMode] = createSignal<'file' | 'text'>(initial()?.pipeMode ?? 'text')
  const [order, setOrder] = createSignal(initial()?.order ?? 1)
  const [timeout, setTimeout_] = createSignal<string>(
    initial()?.timeout !== undefined ? String(initial()!.timeout) : ''
  )

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

  const handleSave = () => {
    const config: PipelineNodeConfig = {
      command: command(),
      trigger: trigger(),
      pipeMode: pipeMode(),
      order: order(),
    }
    if (prompt().trim()) config.prompt = prompt().trim()
    const t = parseInt(timeout())
    if (!isNaN(t) && t > 0) config.timeout = t
    setCellPipeline(props.cellId, config)
    props.onClose()
  }

  const handleClear = () => {
    setCellPipeline(props.cellId, undefined)
    props.onClose()
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: '24px',
        'margin-top': '2px',
        'z-index': '60',
        background: props.colors.surface,
        border: `1px solid ${props.colors.border}`,
        'border-radius': '4px',
        padding: '10px',
        width: '220px',
        'box-shadow': '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: props.colors.text, 'font-size': '11px', 'font-weight': '600', 'margin-bottom': '8px' }}>
        Pipeline Config
      </div>

      {/* Command */}
      <div style={{ 'margin-bottom': '6px' }}>
        <label style={labelStyle()}>Command</label>
        <input
          type="text"
          value={command()}
          onInput={(e) => setCommand((e.target as HTMLInputElement).value)}
          placeholder="e.g. claude --dangerously-skip-permissions"
          style={{ ...inputStyle(), 'font-family': 'monospace' }}
        />
      </div>

      {/* Initial Prompt */}
      <div style={{ 'margin-bottom': '6px' }}>
        <label style={labelStyle()}>Initial Prompt</label>
        <textarea
          value={prompt()}
          onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          placeholder="Optional initial prompt..."
          rows={3}
          style={{
            ...inputStyle(),
            resize: 'vertical',
            'font-family': 'inherit',
          }}
        />
      </div>

      {/* Trigger */}
      <div style={{ 'margin-bottom': '6px' }}>
        <label style={labelStyle()}>Trigger</label>
        <select
          value={trigger()}
          onChange={(e) => setTrigger((e.target as HTMLSelectElement).value as 'auto' | 'manual')}
          style={inputStyle()}
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {/* Pipe Mode */}
      <div style={{ 'margin-bottom': '6px' }}>
        <label style={labelStyle()}>Pipe Mode</label>
        <select
          value={pipeMode()}
          onChange={(e) => setPipeMode((e.target as HTMLSelectElement).value as 'file' | 'text')}
          style={inputStyle()}
        >
          <option value="file">File</option>
          <option value="text">Text</option>
        </select>
      </div>

      {/* Step Order + Timeout row */}
      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '10px' }}>
        <div style={{ flex: '1' }}>
          <label style={labelStyle()}>Step Order</label>
          <input
            type="number"
            min="1"
            value={order()}
            onInput={(e) => setOrder(parseInt((e.target as HTMLInputElement).value) || 1)}
            style={inputStyle()}
          />
        </div>
        <div style={{ flex: '1' }}>
          <label style={labelStyle()}>Timeout (s)</label>
          <input
            type="number"
            min="1"
            value={timeout()}
            onInput={(e) => setTimeout_((e.target as HTMLInputElement).value)}
            placeholder="None"
            style={inputStyle()}
          />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={handleSave}
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
          }}
        >
          Save
        </button>
        <button
          onClick={handleClear}
          style={{
            flex: '1',
            background: 'transparent',
            color: props.colors.error,
            border: `1px solid ${props.colors.error}`,
            'border-radius': '3px',
            padding: '4px 0',
            'font-size': '11px',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

export default PipelineConfigPanel
