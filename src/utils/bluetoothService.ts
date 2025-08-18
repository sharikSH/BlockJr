// src/utils/bluetoothService.ts
import { Capacitor } from '@capacitor/core';

const BluetoothSerial = Capacitor.registerPlugin('BluetoothSerial');

const isNative = Capacitor.getPlatform() !== 'web';
let connectedDeviceId: string | null = null;

let dataListener: { remove: () => void } | null = null;
let disconnectListener: { remove: () => void } | null = null;
let enabledListener: { remove: () => void } | null = null;

interface DeviceItem { id: string; name?: string; }

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

async function scanForDevices(): Promise<DeviceItem[]> {
  if (!isNative) return [];
  try {
    const { devices } = await BluetoothSerial.scan();
    return (devices || []).map((d: any) => ({
      id: d.id,
      name: d.name ?? undefined,
    }));
  } catch (e) {
    console.error('[BT] Scan failed', e);
    throw e;
  }
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