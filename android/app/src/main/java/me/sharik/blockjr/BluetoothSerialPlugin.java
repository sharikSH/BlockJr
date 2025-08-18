package me.sharik.blockjr;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;

import androidx.core.app.ActivityCompat;

import java.io.UnsupportedEncodingException;
import java.util.ArrayDeque;
import java.util.ArrayList;

@CapacitorPlugin(
        name = "BluetoothSerial",
        permissions = {
                @Permission(strings = {Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.ACCESS_FINE_LOCATION}, alias = "bluetooth")
        }
)
public class BluetoothSerialPlugin extends Plugin implements SerialListener {

    private BluetoothAdapter bluetoothAdapter;
    private ArrayList<BluetoothDevice> discoveredDevices = new ArrayList<>();
    private BroadcastReceiver discoveryReceiver;
    private SerialService service;
    private boolean isServiceBound = false;
    private ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((SerialService.SerialBinder) binder).getService();
            isServiceBound = true;
            service.attach(BluetoothSerialPlugin.this);
            tryConnect();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            service = null;
            isServiceBound = false;
        }
    };
    private PluginCall pendingConnectCall;
    private SerialSocket pendingSocket;
    private BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
            JSObject ret = new JSObject();
            ret.put("enabled", state == BluetoothAdapter.STATE_ON);
            notifyListeners("enabledChange", ret);
        }
    };

    @Override
    public void load() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        getContext().registerReceiver(stateReceiver, new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED));
    }

    @Override
    protected void handleOnDestroy() {
        getContext().unregisterReceiver(stateReceiver);
        if (isServiceBound) {
            if (service != null) {
                service.detach();
            }
            getContext().unbindService(serviceConnection);
            isServiceBound = false;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("enabled", bluetoothAdapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }
        if (!bluetoothAdapter.isEnabled()) {
            Intent enableIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
            startActivity(enableIntent);
        }
        call.resolve();
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }
        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth disabled");
            return;
        }
        if (bluetoothAdapter.isDiscovering()) {
            bluetoothAdapter.cancelDiscovery();
        }
        discoveredDevices.clear();
        discoveryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (device != null && device.getType() != BluetoothDevice.DEVICE_TYPE_LE && !containsDevice(device)) {
                        discoveredDevices.add(device);
                    }
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                    JSArray devicesArray = new JSArray();
                    for (BluetoothDevice d : discoveredDevices) {
                        JSObject o = new JSObject();
                        o.put("id", d.getAddress());
                        o.put("name", d.getName());
                        devicesArray.put(o);
                    }
                    JSObject result = new JSObject();
                    result.put("devices", devicesArray);
                    call.resolve(result);
                    try {
                        context.unregisterReceiver(this);
                    } catch (Exception ignored) {
                    }
                    discoveryReceiver = null;
                }
            }

            private boolean containsDevice(BluetoothDevice device) {
                for (BluetoothDevice d : discoveredDevices) {
                    if (d.getAddress().equals(device.getAddress())) {
                        return true;
                    }
                }
                return false;
            }
        };
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        getContext().registerReceiver(discoveryReceiver, filter);
        boolean started = bluetoothAdapter.startDiscovery();
        if (!started) {
            call.reject("Failed to start discovery");
            if (discoveryReceiver != null) {
                try {
                    getContext().unregisterReceiver(discoveryReceiver);
                } catch (Exception ignored) {
                }
                discoveryReceiver = null;
            }
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null) {
            call.reject("No address");
            return;
        }
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported");
            return;
        }
        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
        if (device == null) {
            call.reject("Device not found");
            return;
        }
        pendingConnectCall = call;
        pendingSocket = new SerialSocket(getContext(), device);
        Intent intent = new Intent(getContext(), SerialService.class);
        getContext().startForegroundService(intent);
        getContext().bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void tryConnect() {
        if (pendingSocket == null || pendingConnectCall == null || service == null) return;
        try {
            service.connect(pendingSocket);
            pendingSocket = null;
        } catch (Exception e) {
            onSerialConnectError(e);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        if (service != null) {
            service.disconnect();
        }
        if (isServiceBound) {
            getContext().unbindService(serviceConnection);
            isServiceBound = false;
        }
        Intent intent = new Intent(getContext(), SerialService.class);
        getContext().stopService(intent);
        if (call != null) {
            call.resolve();
        }
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean conn = service != null && service.connected;
        JSObject ret = new JSObject();
        ret.put("connected", conn);
        call.resolve(ret);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("No value");
            return;
        }
        if (service == null || !service.connected) {
            call.reject("Not connected");
            return;
        }
        try {
            service.write((value + "\n").getBytes("UTF-8"));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        String perm = call.getString("permission");
        if (perm == null) {
            call.reject("No permission");
            return;
        }
        int res = getContext().checkSelfPermission(perm);
        JSObject ret = new JSObject();
        ret.put("granted", res == PackageManager.PERMISSION_GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String perm = call.getString("permission");
        if (perm == null) {
            call.reject("No permission");
            return;
        }
        saveCall(call);
        ActivityCompat.requestPermissions(getActivity(), new String[]{perm}, 1);
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
        PluginCall savedCall = getSavedCall();
        if (savedCall == null) return;
        if (grantResults.length > 0) {
            boolean granted = grantResults[0] == PackageManager.PERMISSION_GRANTED;
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            savedCall.resolve(ret);
        } else {
            savedCall.reject("Permission denied");
        }
    }

    @Override
    public void onSerialConnect() {
        if (pendingConnectCall != null) {
            pendingConnectCall.resolve();
            pendingConnectCall = null;
        }
    }

    @Override
    public void onSerialConnectError(Exception e) {
        JSObject ret = new JSObject();
        ret.put("error", e.getMessage());
        notifyListeners("connectError", ret);
        if (pendingConnectCall != null) {
            pendingConnectCall.reject(e.getMessage());
            pendingConnectCall = null;
        }
        disconnect(null);
    }

    @Override
    public void onSerialRead(byte[] data) {
        try {
            String s = new String(data, "UTF-8");
            JSObject ret = new JSObject();
            ret.put("value", s);
            notifyListeners("data", ret);
        } catch (UnsupportedEncodingException ignored) {
        }
    }

    @Override
    public void onSerialRead(ArrayDeque<byte[]> datas) {
        // not used
    }

    @Override
    public void onSerialIoError(Exception e) {
        JSObject ret = new JSObject();
        ret.put("error", e.getMessage());
        notifyListeners("disconnect", ret);
        disconnect(null);
    }
}