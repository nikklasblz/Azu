import { invoke } from '@tauri-apps/api/core'

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
