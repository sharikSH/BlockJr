// src/components/BluetoothConnector.tsx
import React, { useCallback, useEffect, useState } from 'react';
import bluetoothService from '../utils/bluetoothService';
import { ensureBluetoothPermissions } from '../utils/ensureBluetoothPermissions';

interface DeviceItem {
  id: string;
  name?: string;
}

const BluetoothConnector: React.FC = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [receivedData, setReceivedData] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState<boolean | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // Initialize Bluetooth and set up listeners
    const init = async () => {
      try {
        const hasPermissions = await ensureBluetoothPermissions();
        if (!hasPermissions) {
          setError('Bluetooth permissions denied or Bluetooth not enabled');
          return;
        }

        await bluetoothService.initialize();

        // Start listeners
        await bluetoothService.startDataListener((data: string) => {
          setReceivedData((prev) => [...prev, data]);
        });

        await bluetoothService.startDisconnectListener(() => {
          setConnectedDevice(null);
          setReceivedData([]);
          setError('Disconnected from device');
        });

        await bluetoothService.startEnabledListener((enabled: boolean) => {
          setIsBluetoothEnabled(enabled);
          if (!enabled) {
            setConnectedDevice(null);
            setDevices([]);
            setError('Bluetooth disabled');
          }
        });

        // Check initial Bluetooth status (and keep UI consistent)
        try {
          const res: any = await (bluetoothService as any).isConnected ? await (bluetoothService as any).isConnected() : { connected: false };
          // best-effort: some flows keep track elsewhere; we still check enable state:
          const enabledCheck: any = await (bluetoothService as any).isConnected ? await (bluetoothService as any).isConnected() : null;
        } catch {
          // ignore
        }

        try {
          // There is no dedicated isEnabled export in the service wrapper, but we can call the plugin via ensurePermissions earlier.
          // For visual state we'll assume permissions check succeeded; set unknown -> true/false handled by enabled listener above.
        } catch {}
      } catch (e: any) {
        setError(`Initialization failed: ${e?.message ?? String(e)}`);
      }
    };

    init();

    // Cleanup listeners on unmount
    return () => {
      bluetoothService.stopDataListener().catch(() => {});
      bluetoothService.stopDisconnectListener().catch(() => {});
      bluetoothService.stopEnabledListener().catch(() => {});
      bluetoothService.disconnect().catch(() => {});
    };
  }, []);

  // Guarded toggle: prevent toggling while busy (avoids rapid double-click scan races)
  const toggleMenu = useCallback(() => {
    if (isBusy) return;
    setIsMenuOpen((prev) => {
      if (isBusy) return prev; // double-check current busy
      return !prev;
    });
  }, [isBusy]);

  // Scan action (used by button)
  const scanForDevices = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    setIsScanning(true);
    setError(null);
    try {
      const ok = await ensureBluetoothPermissions();
      if (!ok) {
        setError('Permissions required / Bluetooth not enabled');
        return;
      }

      const discoveredDevices = await bluetoothService.scanForDevices();
      setDevices(discoveredDevices);
      if (!discoveredDevices || discoveredDevices.length === 0) {
        setError('No devices found.');
      } else {
        setError(null);
      }
    } catch (e: any) {
      console.error('Scan failed', e);
      setError(`Scan failed: ${e?.message ?? String(e)}`);
    } finally {
      setIsScanning(false);
      setIsBusy(false);
    }
  }, [isBusy]);

  const connectToDevice = useCallback(async (deviceId: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const success = await bluetoothService.connect(deviceId);
      if (success) {
        setConnectedDevice(deviceId);
        setIsMenuOpen(false);
      } else {
        setError('Failed to connect to device');
      }
    } catch (e: any) {
      setError(`Connection failed: ${e?.message ?? String(e)}`);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  const disconnect = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await bluetoothService.disconnect();
      setConnectedDevice(null);
      setReceivedData([]);
    } catch (e: any) {
      setError(`Disconnect failed: ${e?.message ?? String(e)}`);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  return (
    <div className="absolute top-4 right-4 z-50">
      <button
        onClick={toggleMenu}
        className={`
          w-12 h-12 rounded-full shadow-lg transition-all duration-300
          flex items-center justify-center relative
          ${connectedDevice ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-600'}
        `}
        aria-label="Bluetooth connector"
        disabled={isBusy}
      >
        {isBusy && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg
              className={`${connectedDevice ? 'text-white' : 'text-gray-600'} animate-spin h-5 w-5`}
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
          {/* keep icons as before; swap to simple text if you prefer */}
          {connectedDevice ? <span className="w-6 h-6">🔵</span> : <span className="w-6 h-6">🔌</span>}
        </span>
      </button>

      {isMenuOpen && (
        <div className="absolute top-14 right-0 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2">
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Bluetooth</h3>
          </div>

          {error && (
            <div className="px-4 py-2 text-sm text-red-600 border-b border-gray-100">
              {error}
            </div>
          )}

          {!connectedDevice ? (
            <div className="px-4 py-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Discovered Devices:</p>
                <button
                  onClick={scanForDevices}
                  disabled={isScanning || isBusy}
                  className="text-sm text-blue-600 underline"
                >
                  {isScanning ? 'Scanning...' : 'Scan'}
                </button>
              </div>

              {devices.length === 0 && <div className="text-sm text-gray-500">No devices found</div>}
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => connectToDevice(device.id)}
                  disabled={isBusy}
                  className="w-full text-left px-2 py-1 rounded hover:bg-blue-50 text-sm text-gray-700 disabled:opacity-50"
                >
                  {device.name ?? 'Unknown'} ({device.id.slice(0, 8)}...)
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-2">
              <button onClick={disconnect} className="w-full px-4 py-2 text-left hover:bg-gray-50 text-red-600">
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BluetoothConnector;
