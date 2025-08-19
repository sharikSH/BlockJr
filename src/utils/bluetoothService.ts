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
 * Helper: attempt a plugin call and swallow "not implemented" style errors.
 * We log and return undefined on failure so callers can fall back gracefully.
 */
async function safePluginCall(fn: () => Promise<any>, tag = 'BT') {
  if (!isNative) return undefined;
  try {
    return await fn();
  } catch (e: any) {
    // Capacitor throws a "plugin not implemented" error when native side is missing.
    console.warn(`[${tag}] plugin call failed (plugin may be missing)`, e);
    return undefined;
  }
}

/* --- Core API --- */

async function initialize(): Promise<void> {
  if (!isNative) return;
  const res = await safePluginCall(() => BluetoothSerial.isEnabled(), 'BT:init');
  if (res && res.enabled === false) {
    // try to enable, but don't throw if enable fails
    await safePluginCall(() => BluetoothSerial.enable(), 'BT:init-enable');
  }
  console.log('[BT] initialize finished');
}

async function isEnabled(): Promise<{ enabled: boolean }> {
  if (!isNative) return { enabled: false };
  const res = await safePluginCall(() => BluetoothSerial.isEnabled(), 'BT:isEnabled');
  return { enabled: !!(res && res.enabled) };
}

async function scanForDevices(): Promise<DeviceItem[]> {
  if (!isNative) return [];
  const res = await safePluginCall(() => BluetoothSerial.scan(), 'BT:scan');
  const devices = (res?.devices ?? []) as any[];
  return devices.map((d) => ({ id: d.id, name: d.name ?? undefined }));
}

async function connect(deviceId: string): Promise<boolean> {
  if (!isNative) return false;
  console.log('[BT] trying to connect to', deviceId);
  const attempt = await safePluginCall(() => BluetoothSerial.connect({ address: deviceId }), 'BT:connect');
  if (attempt === undefined) {
    // plugin error -> fail gracefully
    connectedDeviceId = null;
    return false;
  }
  connectedDeviceId = deviceId;
  const connRes = await safePluginCall(() => BluetoothSerial.isConnected(), 'BT:isConnected-after-connect');
  const connected = !!(connRes && connRes.connected);
  if (!connected) connectedDeviceId = null;
  return connected;
}

async function disconnect(): Promise<void> {
  if (!isNative) return;
  console.log('[BT] disconnect requested');
  await safePluginCall(() => BluetoothSerial.disconnect(), 'BT:disconnect');
  connectedDeviceId = null;
}

async function isConnected(): Promise<boolean> {
  if (!isNative) return false;
  if (!connectedDeviceId) return false;
  const res = await safePluginCall(() => BluetoothSerial.isConnected(), 'BT:isConnected');
  const connected = !!(res && res.connected);
  if (!connected) connectedDeviceId = null;
  return connected;
}

async function sendString(text: string): Promise<void> {
  if (!isNative) throw new Error('Not native platform');
  if (!connectedDeviceId) throw new Error('Not connected');
  const payload = (text ?? '') + '\n';
  console.log('[BT] write ->', { value: payload });
  const res = await safePluginCall(() => BluetoothSerial.write({ value: payload }), 'BT:write');
  if (res === undefined) throw new Error('Write failed (plugin unavailable or error).');
}

/* --- listeners --- */

export async function startDataListener(onData: (s: string) => void) {
  if (!isNative) return;
  if (dataListener) return;
  const listenerObj = await safePluginCall(() => BluetoothSerial.addListener('data', (ev: any) => {
    console.log('[BT] data', ev);
    try {
      onData(ev.value ?? ev.data ?? ev);
    } catch (e) {
      console.warn('[BT] data listener callback error', e);
    }
  }), 'BT:addListener-data');

  if (listenerObj) {
    dataListener = listenerObj;
    console.log('[BT] data listener registered');
  } else {
    console.warn('[BT] data listener not registered (plugin missing or addListener failed)');
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
  const listenerObj = await safePluginCall(() => BluetoothSerial.addListener('disconnect', (ev: any) => {
    console.log('[BT] disconnect event', ev);
    connectedDeviceId = null;
    try { onDisconnect(); } catch (e) { console.warn('[BT] disconnect callback error', e); }
  }), 'BT:addListener-disconnect');

  if (listenerObj) {
    disconnectListener = listenerObj;
    console.log('[BT] disconnect listener registered');
  } else {
    console.warn('[BT] disconnect listener not registered (plugin missing or addListener failed)');
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
  const listenerObj = await safePluginCall(() => BluetoothSerial.addListener('enabledChange', (ev: any) => {
    console.log('[BT] enabledChange', ev);
    const val = ev.enabled ?? ev.value ?? ev ?? false;
    try { onEnabledChange(Boolean(val)); } catch (e) { console.warn('[BT] enabled callback error', e); }
  }), 'BT:addListener-enabledChange');

  if (listenerObj) {
    enabledListener = listenerObj;
    console.log('[BT] enabled listener registered');
  } else {
    console.warn('[BT] enabled listener not registered (plugin missing or addListener failed)');
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

/* --- exports --- */

export default {
  initialize,
  isEnabled,
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
