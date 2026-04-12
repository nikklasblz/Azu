import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export const clipboard = {
  readText: (): Promise<string> => invoke('read_clipboard_text'),
  writeText: (text: string): Promise<void> => invoke('write_clipboard_text', { text }),
  readImage: (): Promise<string | null> => invoke('read_clipboard_image'),
  writeImage: (base64Png: string): Promise<void> => invoke('write_clipboard_image', { base64Png }),
  saveImageToFile: (): Promise<string | null> => invoke('save_clipboard_image_to_file'),
}

export const config = {
  save: (key: string, value: string): Promise<void> =>
    invoke('save_config', { key, value }),
  load: (key: string): Promise<string | null> =>
    invoke('load_config', { key }),
}

export const opacity = {
  set: (opacity: number): Promise<void> =>
    invoke('set_window_opacity', { opacity }),
}

export const win = {
  create: (title?: string, alwaysOnTop?: boolean): Promise<string> =>
    invoke('create_window', { title, alwaysOnTop }),
  minimize: async (): Promise<void> => {
    const w = getCurrentWebviewWindow()
    await w.minimize()
  },
  maximize: async (): Promise<void> => {
    const w = getCurrentWebviewWindow()
    const maximized = await w.isMaximized()
    if (maximized) await w.unmaximize()
    else await w.maximize()
  },
  close: async (): Promise<void> => {
    const w = getCurrentWebviewWindow()
    await w.close()
  },
  setAlwaysOnTop: async (onTop: boolean): Promise<void> => {
    const w = getCurrentWebviewWindow()
    await w.setAlwaysOnTop(onTop)
  },
}

export const pty = {
  create: (rows: number, cols: number, cwd?: string): Promise<string> =>
    invoke('create_pty', { rows, cols, cwd: cwd || null }),
  write: (id: string, data: string): Promise<void> =>
    invoke('write_pty', { id, data }),
  resize: (id: string, rows: number, cols: number): Promise<void> =>
    invoke('resize_pty', { id, rows, cols }),
  close: (id: string): Promise<void> =>
    invoke('close_pty', { id }),
}

export const dialog = {
  pickFolder: (): Promise<string | null> =>
    invoke('pick_folder'),
}

export const env = {
  detect: (): Promise<Array<{ name: string; installed: boolean; version: string | null }>> =>
    invoke('detect_environment'),
}

export const pipeline = {
  start: (panes: Array<{ cellId: string; ptyId: string; cwd: string; config: any }>): Promise<void> =>
    invoke('pipeline_start', { panes: panes.map(p => ({
      cell_id: p.cellId, pty_id: p.ptyId, cwd: p.cwd, config: {
        command: p.config.command,
        prompt: p.config.prompt || null,
        trigger: p.config.trigger,
        pipe_mode: p.config.pipeMode,
        order: p.config.order,
        timeout: p.config.timeout || null,
      }
    })) }),
  stop: (): Promise<void> => invoke('pipeline_stop'),
  continue_: (): Promise<void> => invoke('pipeline_continue'),
  getState: (): Promise<any> => invoke('pipeline_get_state'),
}

export const license = {
  activate: (key: string): Promise<any> => invoke('activate_license', { key }),
  getStatus: (): Promise<any> => invoke('get_license_status'),
  deactivate: (): Promise<void> => invoke('deactivate_license'),
}

export const ssh = {
  listHosts: (): Promise<any[]> => invoke('ssh_list_hosts'),
  addHost: (host: any): Promise<any[]> => invoke('ssh_add_host', { host }),
  removeHost: (hostId: string): Promise<any[]> => invoke('ssh_remove_host', { hostId }),
  connect: (hostId: string, password: string | null, rows: number, cols: number): Promise<string> =>
    invoke('ssh_connect', { hostId, password, rows, cols }),
  disconnect: (connectionId: string): Promise<void> =>
    invoke('ssh_disconnect', { connectionId }),
  write: (connectionId: string, data: string): Promise<void> =>
    invoke('ssh_write', { connectionId, data }),
  resize: (connectionId: string, rows: number, cols: number): Promise<void> =>
    invoke('ssh_resize', { connectionId, rows, cols }),
  listConnections: (): Promise<any[]> => invoke('ssh_list_connections'),

  // SFTP
  sftpListDir: (connectionId: string, path: string): Promise<any[]> =>
    invoke('sftp_list_dir', { connectionId, path }),
  sftpDownload: (connectionId: string, remotePath: string, localPath: string): Promise<string> =>
    invoke('sftp_download', { connectionId, remotePath, localPath }),
  sftpUpload: (connectionId: string, localPath: string, remotePath: string): Promise<string> =>
    invoke('sftp_upload', { connectionId, localPath, remotePath }),
  sftpMkdir: (connectionId: string, path: string): Promise<void> =>
    invoke('sftp_mkdir', { connectionId, path }),
  sftpRemove: (connectionId: string, path: string): Promise<void> =>
    invoke('sftp_remove', { connectionId, path }),
  sftpRename: (connectionId: string, oldPath: string, newPath: string): Promise<void> =>
    invoke('sftp_rename', { connectionId, oldPath, newPath }),

  // Port forwarding
  addForward: (connectionId: string, config: any): Promise<void> =>
    invoke('ssh_add_forward', { connectionId, config }),
  removeForward: (connectionId: string, forwardId: string): Promise<void> =>
    invoke('ssh_remove_forward', { connectionId, forwardId }),
  listForwards: (): Promise<any[]> =>
    invoke('ssh_list_forwards'),

  // AWS cloud discovery
  awsLightsailDiscover: (): Promise<any[]> => invoke('aws_lightsail_discover'),
}
