import { createSignal } from 'solid-js'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const [updateAvailable, setUpdateAvailable] = createSignal(false)
const [updateVersion, setUpdateVersion] = createSignal('')
const [downloading, setDownloading] = createSignal(false)
const [progress, setProgress] = createSignal(0)
const [readyToRestart, setReadyToRestart] = createSignal(false)
const [updateError, setUpdateError] = createSignal('')

export { updateAvailable, updateVersion, downloading, progress, readyToRestart, updateError }

let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null

async function checkForUpdate() {
  try {
    const update = await check()
    if (update) {
      pendingUpdate = update
      setUpdateVersion(update.version)
      setUpdateAvailable(true)
    }
  } catch {
    // Silently ignore — network errors, dev mode, etc.
  }
}

export async function downloadAndInstall() {
  if (!pendingUpdate) return
  setDownloading(true)
  setProgress(0)
  setUpdateError('')

  try {
    let downloaded = 0
    let contentLength = 0
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? 0
          break
        case 'Progress':
          downloaded += event.data.chunkLength
          if (contentLength > 0) {
            setProgress(Math.round((downloaded / contentLength) * 100))
          }
          break
        case 'Finished':
          setProgress(100)
          break
      }
    })
    setDownloading(false)
    setReadyToRestart(true)
  } catch (e) {
    setDownloading(false)
    setUpdateError('Update failed')
    setTimeout(() => setUpdateError(''), 5000)
  }
}

export async function restartApp() {
  await relaunch()
}

const CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours

export function initUpdater() {
  // First check after short delay (don't block startup)
  setTimeout(checkForUpdate, 3000)
  // Periodic checks
  setInterval(checkForUpdate, CHECK_INTERVAL)
}
