// src/utils/bluetoothService.ts
import { Capacitor } from '@capacitor/core';

const BluetoothSerial = Capacitor.registerPlugin('BluetoothSerial');

const isNative = Capacitor.getPlatform() !== 'web';
let connectedDeviceId: string | null = null;

let dataListener: { remove: () => void } | null = null;
let disconnectListener: { remove: () => void } | null = null;
let enabledListener: { remove: () => void } | null = null;

interface DeviceItem { id: string; name?: string; }

/**
 * Single in-flight scan promise so multiple quick calls reuse the same scan.
 * Cleared when the scan completes.
 */
let scanningPromise: Promise<DeviceItem[]> | null = null;

async function initialize(): Promise<void> {
  if (!isNative) return;
  try {
    const { enabled } = await BluetoothSerial.isEnabled();
    if (!enabled) {
      await BluetoothSerial.enable();
    }
    console.log('[BT] initialized, enabled:', enabled);
  } catch (e) {
    console.error('[BT] Bluetooth initialization failed', e);
    throw e;
  }
}

/**
 * Robust scan wrapper:
 * - If a scan is already in progress, return the same promise.
 * - Call native scan(); if it returns empty, wait a short time and retry once.
 * - Ensure the in-flight promise is cleared on completion so future scans work.
 */
async function scanForDevices(): Promise<DeviceItem[]> {
  if (!isNative) return [];

  // reuse ongoing scan if present
  if (scanningPromise) {
    console.log('[BT] scan already in progress — returning existing promise');
    return scanningPromise;
  }

  scanningPromise = (async () => {
    try {
      // quick pre-check that bluetooth is enabled
      try {
        const { enabled } = await BluetoothSerial.isEnabled();
        if (!enabled) {
          // Let caller handle the UI; throw here so caller can diagnose
          throw new Error('Bluetooth is not enabled');
        }
      } catch (e) {
        // If isEnabled itself fails, continue and try scan (scan will likely fail)
        console.warn('[BT] isEnabled check failed before scan', e);
      }

      const attemptScanOnce = async (): Promise<DeviceItem[]> => {
        try {
          const res: any = await BluetoothSerial.scan();
          const devicesRaw = res?.devices ?? [];
          const mapped: DeviceItem[] = (devicesRaw || []).map((d: any) => ({
            id: d.id,
            name: d.name ?? undefined,
          }));
          return mapped;
        } catch (err) {
          console.error('[BT] native scan() failed', err);
          throw err;
        }
      };

      // First attempt
      let devices = await attemptScanOnce();

      // If no devices found, it's often a timing/race issue — do a short wait and retry once
      if ((!devices || devices.length === 0)) {
        console.log('[BT] scan returned no devices, waiting briefly and retrying once...');
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const retryDevices = await attemptScanOnce();
          if (retryDevices && retryDevices.length > 0) {
            devices = retryDevices;
          } else {
            // keep devices as empty array
            devices = retryDevices ?? [];
          }
        } catch (retryErr) {
          // if retry fails, preserve first attempt's empty result or propagate the retry error
          console.warn('[BT] scan retry failed', retryErr);
          // If native scan throws (e.g. discovery couldn't start), propagate that error:
          throw retryErr;
        }
      }

      return devices || [];
    } finally {
      // clear in-flight promise so next scan can be started later
      scanningPromise = null;
    }
  })();

  return scanningPromise;
}

async function connect(deviceId: string): Promise<boolean> {
  if (!isNative) return false;
  console.log('[BT] trying to connect to', deviceId);
  try {
    await BluetoothSerial.connect({ address: deviceId });
    connectedDeviceId = deviceId;
    console.log('[BT] connect succeeded');
    const { connected } = await BluetoothSerial.isConnected();
    if (!connected) {
      connectedDeviceId = null;
      return false;
    }
    return true;
  } catch (error) {
    console.error('[BT] Connection failed', error);
    connectedDeviceId = null;
    return false;
  }
}

async function disconnect(): Promise<void> {
  if (!isNative) return;
  console.log('[BT] disconnect requested');
  try {
    await BluetoothSerial.disconnect();
  } catch (e) {
    console.warn('[BT] disconnect error', e);
  } finally {
    connectedDeviceId = null;
  }
}

async function isConnected(): Promise<boolean> {
  if (!isNative) return false;
  if (!connectedDeviceId) return false;
  try {
    const { connected } = await BluetoothSerial.isConnected();
    if (!connected) connectedDeviceId = null;
    return connected;
  } catch (e) {
    console.error('[BT] isConnected failed', e);
    connectedDeviceId = null;
    return false;
  }
}

async function sendString(text: string): Promise<void> {
  if (!isNative) throw new Error('Not native platform');
  if (!connectedDeviceId) throw new Error('Not connected');

  const payload = (text ?? '') + '\n';
  console.log('[BT] write ->', { value: payload });
  try {
    await BluetoothSerial.write({ value: payload });
  } catch (e) {
    console.error('[BT] write failed', e);
    throw e;
  }
}

/* --- listeners --- */

export async function startDataListener(onData: (s: string) => void) {
  if (!isNative) return;
  if (dataListener) return;
  try {
    dataListener = await BluetoothSerial.addListener('data', (ev: any) => {
      console.log('[BT] data', ev);
      onData(ev.value ?? ev.data ?? ev);
    });
    console.log('[BT] data listener registered');
  } catch (e) {
    console.error('[BT] startDataListener failed', e);
  }
}

export async function stopDataListener() {
  if (!dataListener) return;
  try {
    await dataListener.remove();
  } catch (e) { /* ignore */ }
  dataListener = null;
  console.log('[BT] data listener removed');
}

export async function startDisconnectListener(onDisconnect: () => void) {
  if (!isNative) return;
  if (disconnectListener) return;
  try {
    disconnectListener = await BluetoothSerial.addListener('disconnect', (ev: any) => {
      console.log('[BT] disconnect event', ev);
      connectedDeviceId = null;
      onDisconnect();
    });
    console.log('[BT] disconnect listener registered');
  } catch (e) {
    console.warn('[BT] startDisconnectListener failed', e);
  }
}

export async function stopDisconnectListener() {
  if (!disconnectListener) return;
  try {
    await disconnectListener.remove();
  } catch (e) { /* ignore */ }
  disconnectListener = null;
  console.log('[BT] disconnect listener removed');
}

export async function startEnabledListener(onEnabledChange: (enabled: boolean) => void) {
  if (!isNative) return;
  if (enabledListener) return;
  try {
    enabledListener = await BluetoothSerial.addListener('enabledChange', (ev: any) => {
      console.log('[BT] enabledChange', ev);
      const val = ev.enabled ?? ev.value ?? ev ?? false;
      onEnabledChange(Boolean(val));
    });
    console.log('[BT] enabled listener registered');
  } catch (e) {
    console.warn('[BT] startEnabledListener failed', e);
  }
}

export async function stopEnabledListener() {
  if (!enabledListener) return;
  try {
    await enabledListener.remove();
  } catch (e) { /* ignore */ }
  enabledListener = null;
  console.log('[BT] enabled listener removed');
}

export default {
  initialize,
  scanForDevices,
  connect,
  disconnect,
  isConnected,
  sendString,
  startDataListener,
  stopDataListener,
  startDisconnectListener,
  stopDisconnectListener,
  startEnabledListener,
  stopEnabledListener,
};
