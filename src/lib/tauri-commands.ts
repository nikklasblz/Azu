import { invoke } from '@tauri-apps/api/core'

export const clipboard = {
  readText: (): Promise<string> => invoke('read_clipboard_text'),
  writeText: (text: string): Promise<void> => invoke('write_clipboard_text', { text }),
  readImage: (): Promise<string | null> => invoke('read_clipboard_image'),
  writeImage: (base64Png: string): Promise<void> => invoke('write_clipboard_image', { base64Png }),
}

export const config = {
  save: (key: string, value: string): Promise<void> =>
    invoke('save_config', { key, value }),
  load: (key: string): Promise<string | null> =>
    invoke('load_config', { key }),
}

export const win = {
  create: (title?: string, alwaysOnTop?: boolean): Promise<string> =>
    invoke('create_window', { title, alwaysOnTop }),
  minimize: (label?: string): Promise<void> =>
    invoke('minimize_window', { label }),
  maximize: (label?: string): Promise<void> =>
    invoke('maximize_window', { label }),
  close: (label?: string): Promise<void> =>
    invoke('close_window', { label }),
  setAlwaysOnTop: (onTop: boolean, label?: string): Promise<void> =>
    invoke('set_always_on_top', { label, onTop }),
}

export const pty = {
  create: (rows: number, cols: number): Promise<string> =>
    invoke('create_pty', { rows, cols }),
  write: (id: string, data: string): Promise<void> =>
    invoke('write_pty', { id, data }),
  resize: (id: string, rows: number, cols: number): Promise<void> =>
    invoke('resize_pty', { id, rows, cols }),
  close: (id: string): Promise<void> =>
    invoke('close_pty', { id }),
}
