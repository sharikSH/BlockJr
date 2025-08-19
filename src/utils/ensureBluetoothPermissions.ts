// src/utils/ensureBluetoothPermissions.ts
import { Capacitor } from '@capacitor/core';

const BluetoothSerial = Capacitor.registerPlugin('BluetoothSerial');

const platform = Capacitor.getPlatform();
const isNative = platform !== 'web';

/**
 * Best-effort check for Bluetooth usage prerequisites.
 * Returns true when Bluetooth is enabled and necessary conditions are met.
 * Returns false when user action is required (e.g., enable Bluetooth) OR plugin missing.
 *
 * Important: this function no longer throws on missing plugin; it returns false so UI can show friendly message.
 */
export async function ensureBluetoothPermissions(): Promise<boolean> {
  if (!isNative) {
    console.log('[ensureBluetoothPermissions] Not native platform; skipping checks (web).');
    return true;
  }

  // Guard plugin calls so missing native implementation doesn't throw uncaught errors
  try {
    const perms = [
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.ACCESS_FINE_LOCATION'
    ];

    // If checkPermission not available (plugin missing) this will throw — we catch below and return false.
    for (const p of perms) {
      try {
        const chk = await BluetoothSerial.checkPermission({ permission: p }) as any;
        let granted = Boolean(chk?.granted);
        if (!granted) {
          const rq = await BluetoothSerial.requestPermission({ permission: p }) as any;
          granted = Boolean(rq?.granted);
          if (!granted) {
            console.warn(`[ensureBluetoothPermissions] Permission ${p} denied`);
            return false;
          }
        }
      } catch (e) {
        console.warn('[ensureBluetoothPermissions] permission check/request failed (plugin may be missing)', e);
        return false;
      }
    }

    // Ensure Bluetooth enabled — attempt enable (best-effort).
    let bluetoothEnabled = false;
    let retries = 3;
    while (retries > 0) {
      try {
        const res = await BluetoothSerial.isEnabled() as any;
        bluetoothEnabled = !!res?.enabled;
        if (bluetoothEnabled) {
          console.log('[ensureBluetoothPermissions] Bluetooth enabled');
          break;
        }
        // try to enable
        await BluetoothSerial.enable();
        // small wait
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.warn('[ensureBluetoothPermissions] isEnabled/enable failed (plugin may be missing or user declined)', e);
        // don't throw — break to allow returning false below
      }
      retries--;
    }

    if (!bluetoothEnabled) {
      console.warn('[ensureBluetoothPermissions] Bluetooth could not be enabled; user action required');
      return false;
    }

    console.log('[ensureBluetoothPermissions] All checks passed');
    return true;
  } catch (e) {
    console.warn('[ensureBluetoothPermissions] Unexpected error (treating as failure)', e);
    return false;
  }
}
