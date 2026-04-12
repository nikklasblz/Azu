import { createSignal } from 'solid-js'
import { license as licenseCmd } from '../lib/tauri-commands'

const [proEnabled, setProEnabled] = createSignal(false)
const [licenseInfo, setLicenseInfo] = createSignal<any>(null)
const [licenseError, setLicenseError] = createSignal('')

export { proEnabled, licenseInfo, licenseError }

export async function checkLicense() {
  try {
    const status = await licenseCmd.getStatus()
    setProEnabled(status.valid && !status.expired)
    setLicenseInfo(status.info)
  } catch {
    setProEnabled(false)
  }
}

export async function activateLicense(key: string): Promise<boolean> {
  setLicenseError('')
  try {
    const status = await licenseCmd.activate(key)
    setProEnabled(status.valid && !status.expired)
    setLicenseInfo(status.info)
    return status.valid
  } catch (e: any) {
    setLicenseError(String(e))
    return false
  }
}

export async function deactivateLicense() {
  await licenseCmd.deactivate()
  setProEnabled(false)
  setLicenseInfo(null)
}
