// src/components/BluetoothConnector.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bluetooth, BluetoothConnected } from 'lucide-react';
import { ensureBluetoothPermissions } from '../utils/ensureBluetoothPermissions';
import bluetoothService from '../utils/bluetoothService';

interface DeviceItem {
  id: string;
  name?: string;
}

interface BluetoothConnectorProps {
  onConnectionChange?: (isConnected: boolean) => void;
}

export const BluetoothConnector: React.FC<BluetoothConnectorProps> = ({ onConnectionChange }) => {
  const isNative = Capacitor.getPlatform() !== 'web';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [nearbyDevices, setNearbyDevices] = useState<DeviceItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastConnectedDevice, setLastConnectedDevice] = useState<DeviceItem | null>(null);

  /**
   * Check if location services are available (some Android devices require this for Bluetooth scanning)
   */
  async function isLocationAvailable(timeout = 3000): Promise<boolean> {
    if (!isNative) return true;
    if (!('geolocation' in navigator)) return false;

    return new Promise<boolean>((resolve) => {
      let done = false;
      const onSuccess = () => { if (!done) { done = true; resolve(true); } };
      const onFail = () => { if (!done) { done = true; resolve(false); } };

      navigator.geolocation.getCurrentPosition(
        () => onSuccess(),
        (err) => {
          console.warn('geolocation check failed', err);
          onFail();
        },
        { timeout, maximumAge: 0 }
      );

      setTimeout(() => {
        if (!done) { done = true; resolve(false); }
      }, timeout + 500);
    });
  }

  /**
   * Diagnose scan failure and set helpful statusMessage
   */
  const diagnoseScanFailure = useCallback(async (scanError?: any) => {
    setStatusMessage('Scan failed — checking permissions and device state...');
    try {
      // try to ensure/request permissions (best-effort)
      const permsOk = await ensureBluetoothPermissions();
      if (!permsOk) {
        setStatusMessage('Required Bluetooth/location permissions are not granted or plugin missing. Please grant them in app settings or ensure plugin is installed.');
        return;
      }

      // check bluetooth enabled
      let bluetoothEnabled = false;
      try {
        const res = await bluetoothService.isEnabled();
        bluetoothEnabled = !!res.enabled;
      } catch (e) {
        console.warn('bluetoothService.isEnabled failed', e);
      }

      if (!bluetoothEnabled) {
        setStatusMessage('Bluetooth appears to be OFF. Please enable Bluetooth.');
        return;
      }

      // check location
      const locationOk = await isLocationAvailable();
      if (!locationOk) {
        setStatusMessage('Location appears to be OFF or permission denied. Location is required for scanning on some devices.');
        return;
      }

      // else show generic scan error
      const errMsg = scanError?.message ?? String(scanError ?? 'Unknown error');
      setStatusMessage(`Scan failed: ${errMsg}`);
    } catch (e) {
      console.error('diagnoseScanFailure failed', e);
      setStatusMessage('Scan failed and diagnostics could not complete. See console.');
    }
  }, []);

  /**
   * Connect handler
   */
  const handleConnect = useCallback(async (device: DeviceItem) => {
    if (isBusy) return;
    setIsBusy(true);
    setStatusMessage(`Connecting to ${device.name ?? device.id}...`);

    try {
      // try to ensure permissions first (best-effort)
      const permsOk = await ensureBluetoothPermissions();
      if (!permsOk) {
        setStatusMessage('Permissions required. Please grant permissions in app settings or ensure the native plugin is installed.');
        setIsBusy(false);
        return;
      }

      const ok = await bluetoothService.connect(device.id);
      if (!ok) {
        setStatusMessage(`Failed to connect to ${device.name ?? device.id}.`);
        setIsBusy(false);
        return;
      }

      setIsConnected(true);
      setLastConnectedDevice(device);
      onConnectionChange?.(true);
      setStatusMessage(`Connected to ${device.name ?? device.id}`);
      alert(`Connected to ${device.name ?? device.id}`);

      // start listeners
      try {
        await bluetoothService.startDataListener((s) => {
          console.log('[BT UI] onData ->', s);
          // optionally display incoming data
          // setStatusMessage(`Received: ${s}`);
        });
      } catch (e) {
        console.warn('startDataListener failed', e);
      }

      try {
        await bluetoothService.startDisconnectListener(() => {
          console.log('[BT UI] disconnect event');
          setIsConnected(false);
          setLastConnectedDevice(null);
          onConnectionChange?.(false);
          setStatusMessage('Disconnected from device.');
          alert('Disconnected from device.');
          // cleanup
          bluetoothService.stopDataListener().catch(() => {});
          bluetoothService.stopEnabledListener().catch(() => {});
          bluetoothService.stopDisconnectListener().catch(() => {});
        });
      } catch (e) {
        console.warn('startDisconnectListener failed', e);
      }

      try {
        await bluetoothService.startEnabledListener((enabled) => {
          console.log('[BT UI] enabled change ->', enabled);
          setStatusMessage(enabled ? null : 'Bluetooth is turned OFF on device.');
          if (!enabled) {
            setIsConnected(false);
            setLastConnectedDevice(null);
            onConnectionChange?.(false);
            alert('Bluetooth turned OFF on device.');
          }
        });
      } catch (e) {
        console.warn('startEnabledListener failed', e);
      }

      setIsMenuOpen(false);
    } catch (err) {
      console.error('handleConnect error', err);
      setStatusMessage('Connection error. See console.');
      alert('Connection error: ' + String(err));
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onConnectionChange]);

  /**
   * Disconnect handler
   */
  const handleDisconnect = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await bluetoothService.stopDataListener();
      await bluetoothService.stopEnabledListener();
      await bluetoothService.stopDisconnectListener();
    } catch (e) {
      console.warn('Error stopping listeners', e);
    }

    try {
      await bluetoothService.disconnect();
      setIsConnected(false);
      setLastConnectedDevice(null);
      onConnectionChange?.(false);
      setStatusMessage('Disconnected.');
      alert('Disconnected from device.');
    } catch (e) {
      console.warn('Disconnect failed', e);
      setStatusMessage('Disconnect failed. See console.');
      alert('Disconnect failed: ' + String(e));
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onConnectionChange]);

  const handleEnableBluetooth = async () => {
    try {
      await BluetoothSerialEnable();
      setStatusMessage(null);
      alert('Bluetooth enable requested.');
    } catch (e) {
      console.error('Failed to enable Bluetooth', e);
      setStatusMessage('Failed to enable Bluetooth.');
      alert('Failed to enable Bluetooth: ' + String(e));
    }
  };

  // small helper to attempt enabling through the plugin safely
  async function BluetoothSerialEnable() {
    if (!isNative) throw new Error('Not native');
    try {
      // plugin call may fail if plugin is missing; safePluginCall pattern is implemented in service but we call directly here for immediate user action
      await (Capacitor as any).registerPlugin('BluetoothSerial').enable();
    } catch (e) {
      console.warn('Bluetooth enable failed (plugin may be missing)', e);
      throw e;
    }
  }

  /**
   * Periodic connection check when connected
   */
  useEffect(() => {
    if (!isConnected || !isNative) return;

    const checkConnection = async () => {
      try {
        const conn = await bluetoothService.isConnected();
        if (!conn) {
          setIsConnected(false);
          setLastConnectedDevice(null);
          onConnectionChange?.(false);
          setStatusMessage('Connection lost.');
          alert('Connection lost. Please reconnect.');
        }
      } catch (e) {
        console.warn('Periodic connection check failed', e);
        setIsConnected(false);
        setLastConnectedDevice(null);
        onConnectionChange?.(false);
        setStatusMessage('Connection check failed. See console.');
        alert('Connection lost due to check failure: ' + String(e));
      }
    };

    const interval = setInterval(checkConnection, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [isConnected, isNative, onConnectionChange]);

  /**
   * init on mount
   */
  useEffect(() => {
    const init = async () => {
      try {
        await bluetoothService.initialize();
        if (!isNative) {
          setStatusMessage('Bluetooth Serial is not supported on web.');
          alert('Bluetooth Serial is not supported on web.');
        }
      } catch (e) {
        console.error('Bluetooth initialization failed', e);
        setStatusMessage('Bluetooth initialization failed (permissions may be required or plugin missing).');
        alert('Bluetooth initialization failed: ' + String(e));
      }
    };
    init();
    // cleanup on unmount: stop listeners
    return () => {
      bluetoothService.stopDataListener().catch(() => {});
      bluetoothService.stopEnabledListener().catch(() => {});
      bluetoothService.stopDisconnectListener().catch(() => {});
    };
  }, [isNative]);

  /**
   * Scan when menu opens
   */
  useEffect(() => {
    if (isMenuOpen && !isConnected && isNative) {
      const fetchNearby = async () => {
        setIsBusy(true);
        setStatusMessage('Scanning for devices...');
        try {
          const devices = await bluetoothService.scanForDevices();
          setNearbyDevices(devices);
          if (!devices || devices.length === 0) {
            setStatusMessage('No devices found.');
            alert('No Bluetooth devices found.');
          } else {
            setStatusMessage(null);
          }
        } catch (e: any) {
          console.error('Scan failed', e);
          await diagnoseScanFailure(e);
          alert('Scan failed: ' + String(e));
        }
        setIsBusy(false);
      };
      fetchNearby();
    }
  }, [isMenuOpen, isConnected, isNative, diagnoseScanFailure]);

  /**
   * When menu open and connected, verify connection still alive
   */
  useEffect(() => {
    if (isMenuOpen && isConnected) {
      const checkConn = async () => {
        const conn = await bluetoothService.isConnected();
        if (!conn) {
          setIsConnected(false);
          setLastConnectedDevice(null);
          onConnectionChange?.(false);
          setStatusMessage('Connection lost.');
          alert('Connection lost. Please reconnect.');
        }
      };
      checkConn();
    }
  }, [isMenuOpen, isConnected, onConnectionChange]);

  return (
    <div className="absolute top-4 right-4 z-50">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          w-12 h-12 rounded-full shadow-lg transition-all duration-300
          flex items-center justify-center relative
          ${isConnected ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-600'}
        `}
        aria-label="Bluetooth connector"
        disabled={isBusy}
      >
        {isBusy && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg
              className={`${isConnected ? 'text-white' : 'text-gray-600'} animate-spin h-5 w-5`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 100 8v4a8 8 0 01-8-8z"></path>
            </svg>
          </span>
        )}
        <span className={isBusy ? 'opacity-0' : 'opacity-100'}>
          {isConnected ? <BluetoothConnected className="w-6 h-6"/> : <Bluetooth  className="w-6 h-6" />}
        </span>
      </button>

      {isMenuOpen && (
        <div className="absolute top-14 right-0 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2">
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Bluetooth</h3>
          </div>

          {statusMessage && (
            <div className="px-4 py-2 text-sm text-red-600 border-b border-gray-100">
              {statusMessage}
              {statusMessage.toLowerCase().includes('off') && (
                <button onClick={handleEnableBluetooth} className="ml-2 text-blue-600 underline">
                  Enable
                </button>
              )}
              {statusMessage.toLowerCase().includes('permission') && (
                <button
                  onClick={async () => {
                    setStatusMessage('Requesting permissions...');
                    const ok = await ensureBluetoothPermissions();
                    setStatusMessage(ok ? null : 'Permissions required. Please grant them in settings.');
                  }}
                  className="ml-2 text-blue-600 underline"
                >
                  Request permissions
                </button>
              )}
              {statusMessage.toLowerCase().includes('location') && (
                <button
                  onClick={async () => {
                    setStatusMessage('Requesting permissions...');
                    const ok = await ensureBluetoothPermissions();
                    setStatusMessage(ok ? null : 'Permissions required. Please grant them in settings.');
                  }}
                  className="ml-2 text-blue-600 underline"
                >
                  Request permissions
                </button>
              )}
            </div>
          )}

          {isConnected ? (
            <button onClick={handleDisconnect} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-red-600">
              Disconnect
            </button>
          ) : (
            <>
              {isNative ? (
                <div className="px-4 py-2">
                  <p className="text-sm text-gray-600 mb-2">Discovered Devices:</p>
                  {nearbyDevices.length === 0 && <div className="text-sm text-gray-500">No devices found</div>}
                  {nearbyDevices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleConnect(device)}
                      disabled={isBusy}
                      className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 text-sm text-gray-700 disabled:opacity-50"
                    >
                      {device.name ?? 'Unknown'} ({device.id.slice(0, 8)}...)
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2 text-sm text-gray-600">
                  Not supported on web.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BluetoothConnector;
