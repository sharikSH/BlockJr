import React, { useEffect, useState } from 'react';
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

        // Check initial Bluetooth status
        const { enabled } = await bluetoothService.isEnabled();
        setIsBluetoothEnabled(enabled);
      } catch (e) {
        setError(`Initialization failed: ${e.message}`);
      }
    };

    init();

    // Cleanup listeners on unmount
    return () => {
      bluetoothService.stopDataListener();
      bluetoothService.stopDisconnectListener();
      bluetoothService.stopEnabledListener();
      bluetoothService.disconnect();
    };
  }, []);

  const scanForDevices = async () => {
    if (!isBluetoothEnabled) {
      setError('Bluetooth is not enabled');
      return;
    }
    setIsScanning(true);
    setError(null);
    try {
      const discoveredDevices = await bluetoothService.scanForDevices();
      setDevices(discoveredDevices);
    } catch (e) {
      setError(`Scan failed: ${e.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (deviceId: string) => {
    if (!isBluetoothEnabled) {
      setError('Bluetooth is not enabled');
      return;
    }
    setError(null);
    try {
      const success = await bluetoothService.connect(deviceId);
      if (success) {
        setConnectedDevice(deviceId);
      } else {
        setError('Failed to connect to device');
      }
    } catch (e) {
      setError(`Connection failed: ${e.message}`);
    }
  };

  const disconnect = async () => {
    try {
      await bluetoothService.disconnect();
      setConnectedDevice(null);
      setReceivedData([]);
    } catch (e) {
      setError(`Disconnect failed: ${e.message}`);
    }
  };

  const sendTestData = async () => {
    if (!connectedDevice) {
      setError('No device connected');
      return;
    }
    try {
      await bluetoothService.sendString('TEST\n');
    } catch (e) {
      setError(`Send failed: ${e.message}`);
    }
  };

  return (
    <div>
      <h2>Bluetooth Connector</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p>Bluetooth Enabled: {isBluetoothEnabled === null ? 'Checking...' : isBluetoothEnabled ? 'Yes' : 'No'}</p>
      {connectedDevice ? (
        <>
          <p>Connected to: {devices.find((d) => d.id === connectedDevice)?.name || connectedDevice}</p>
          <button onClick={disconnect}>Disconnect</button>
          <button onClick={sendTestData}>Send Test</button>
          <h3>Received Data:</h3>
          <ul>
            {receivedData.map((data, index) => (
              <li key={index}>{data}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <button onClick={scanForDevices} disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Scan for Devices'}
          </button>
          <h3>Discovered Devices:</h3>
          <ul>
            {devices.map((device) => (
              <li key={device.id}>
                {device.name || device.id}{' '}
                <button onClick={() => connectToDevice(device.id)} disabled={isScanning}>
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default BluetoothConnector;