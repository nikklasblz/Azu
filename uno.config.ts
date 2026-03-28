import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      surface: 'var(--azu-surface)',
      'surface-alt': 'var(--azu-surface-alt)',
      border: 'var(--azu-border)',
      text: 'var(--azu-text)',
      'text-muted': 'var(--azu-text-muted)',
      accent: 'var(--azu-accent)',
    },
  },
})
