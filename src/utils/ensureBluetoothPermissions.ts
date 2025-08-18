// src/utils/ensureBluetoothPermissions.ts
import { Capacitor } from '@capacitor/core';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

const platform = Capacitor.getPlatform();
const isNative = platform !== 'web';

/**
 * Best-effort check for Bluetooth usage prerequisites.
 * Returns true when Bluetooth is enabled and necessary conditions are met.
 * Returns false when user action is required (e.g., enable Bluetooth).
 */
export async function ensureBluetoothPermissions(): Promise<boolean> {
  if (!isNative) {
    console.log('[ensureBluetoothPermissions] Not native platform; skipping checks (web).');
    return true;
  }

  // 1) Ensure Bluetooth is enabled
  let bluetoothEnabled = false;
  let retries = 3;
  while (retries > 0) {
    try {
      const { enabled } = await BluetoothSerial.isEnabled();
      bluetoothEnabled = enabled;
      if (enabled) {
        console.log('[ensureBluetoothPermissions] Bluetooth is enabled');
        break;
      }
      console.log(`[ensureBluetoothPermissions] Bluetooth disabled, attempting to enable... (attempt ${4 - retries}/3)`);
      await BluetoothSerial.enable();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for enable to take effect
    } catch (e) {
      console.warn(`[ensureBluetoothPermissions] Bluetooth enable attempt failed (attempt ${4 - retries}/3)`, e);
    }
    retries--;
  }

  if (!bluetoothEnabled) {
    console.warn('[ensureBluetoothPermissions] Bluetooth could not be enabled; user action required');
    return false;
  }

  // All checks passed (Bluetooth enabled)
  console.log('[ensureBluetoothPermissions] All checks passed');
  return true;
}