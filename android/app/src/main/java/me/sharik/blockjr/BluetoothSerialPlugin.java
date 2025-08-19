// android/app/src/main/java/<your_package>/BluetoothSerialPlugin.java
package com.example.myapp; // <-- REPLACE with your package name

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.PluginMethod;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Minimal Capacitor plugin wrapper around Android Bluetooth APIs.
 *
 * Exposes methods:
 * - isEnabled() -> { enabled: boolean }
 * - enable() -> { enabled: boolean } (fires an ACTION_REQUEST_ENABLE intent)
 * - scan() -> { devices: [ { id, name } ] }  (performs discovery and resolves when discovery finishes or timeout)
 * - connect({ address }) -> resolves true/false
 * - disconnect() -> resolves
 * - write({ value }) -> resolves
 *
 * Emits events with notifyListeners:
 * - "data" -> { value: "..." }
 * - "disconnect" -> {}
 * - "enabledChange" -> { enabled: boolean }
 *
 * NOTE: This is a minimal, pragmatic implementation intended to work with the existing JS UI.
 * It uses RFCOMM SPP UUID for connect. If you have a different socket abstraction in SimpleBluetoothTerminal,
 * you can replace the connect/read logic with the project's SerialSocket classes.
 */
@CapacitorPlugin(name = "BluetoothSerial")
public class BluetoothSerialPlugin extends Plugin {

    private static final String TAG = "BluetoothSerialPlugin";
    private final BluetoothAdapter btAdapter = BluetoothAdapter.getDefaultAdapter();

    // Discovery
    private final ArrayList<JSObject> discoveredDevices = new ArrayList<>();
    private BroadcastReceiver discoveryReceiver;
    private final AtomicBoolean discoveryInProgress = new AtomicBoolean(false);

    // Connection
    private BluetoothSocket socket = null;
    private BluetoothDevice connectedDevice = null;
    private Thread readThread = null;
    private final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @Override
    public void load() {
        Log.d(TAG, "plugin loaded");
        // listen for adapter state changes
        IntentFilter f = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        getContext().registerReceiver(new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                final int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1);
                boolean enabled = state == BluetoothAdapter.STATE_ON;
                notifyEnabledChange(enabled);
            }
        }, f);
    }

    private void notifyEnabledChange(boolean enabled) {
        JSObject o = new JSObject();
        o.put("enabled", enabled);
        notifyListeners("enabledChange", o);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean enabled = (btAdapter != null && btAdapter.isEnabled());
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (btAdapter == null) {
            call.reject("Bluetooth adapter not available");
            return;
        }
        Activity activity = getActivity();
        Intent enableIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
        try {
            // Start the standard activity to request enabling Bluetooth.
            // This returns immediately; the user may still need to accept.
            activity.startActivity(enableIntent);
            JSObject ret = new JSObject();
            ret.put("enabled", btAdapter.isEnabled());
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "enable request failed", e);
            call.reject("enable failed", e);
        }
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        if (btAdapter == null) {
            call.reject("Bluetooth adapter not available");
            return;
        }

        // If discovery already running, return early with current discovered devices
        if (discoveryInProgress.get()) {
            JSObject out = new JSObject();
            out.put("devices", new JSArray(discoveredDevices));
            call.resolve(out);
            return;
        }

        discoveredDevices.clear();

        discoveryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                final String action = intent.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    JSObject d = new JSObject();
                    d.put("id", device.getAddress());
                    d.put("name", device.getName() != null ? device.getName() : "Unknown");
                    discoveredDevices.add(d);
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                    // done
                    getContext().unregisterReceiver(this);
                    discoveryInProgress.set(false);
                    JSObject out = new JSObject();
                    out.put("devices", new JSArray(discoveredDevices));
                    call.resolve(out);
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);

        try {
            getContext().registerReceiver(discoveryReceiver, filter);
        } catch (Exception e) {
            Log.w(TAG, "registerReceiver failed", e);
            // still attempt scan but without receiver (shouldn't happen)
        }

        boolean started = btAdapter.startDiscovery();
        discoveryInProgress.set(started);
        if (!started) {
            // If discovery failed to start, cleanup and reject
            try {
                getContext().unregisterReceiver(discoveryReceiver);
            } catch (Exception ignored) {}
            discoveryInProgress.set(false);
            call.reject("startDiscovery failed");
        } else {
            // discovery will resolve the call when ACTION_DISCOVERY_FINISHED fires
            // as a safety timeout, also schedule a fallback resolution after 8s
            // to avoid never resolving on some devices
            final PluginCall pending = call;
            getBridge().getActivity().getWindow().getDecorView().postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (discoveryInProgress.get()) {
                        try {
                            btAdapter.cancelDiscovery();
                        } catch (Exception ignored) {}
                        try {
                            getContext().unregisterReceiver(discoveryReceiver);
                        } catch (Exception ignored) {}
                        discoveryInProgress.set(false);
                        JSObject out = new JSObject();
                        out.put("devices", new JSArray(discoveredDevices));
                        if (pending != null && !pending.isReleased()) {
                            pending.resolve(out);
                        }
                    }
                }
            }, 8000);
        }
    }

    @PluginMethod
    public void connect(final PluginCall call) {
        String address = call.getString("address");
        if (address == null) {
            call.reject("address is required");
            return;
        }
        if (btAdapter == null) {
            call.reject("Bluetooth adapter not available");
            return;
        }

        // stop discovery while connecting
        try { btAdapter.cancelDiscovery(); } catch (Exception ignored) {}

        final BluetoothDevice device = btAdapter.getRemoteDevice(address);
        final JSObject res = new JSObject();

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // create rfcomm socket and connect
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                    connectedDevice = device;

                    // start reader thread
                    startReadThread();

                    res.put("connected", true);
                    call.resolve(res);
                } catch (IOException e) {
                    Log.e(TAG, "connect failed", e);
                    res.put("connected", false);
                    call.resolve(res);
                    try {
                        if (socket != null) {
                            socket.close();
                        }
                    } catch (Exception ignored) {}
                    socket = null;
                }
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            stopReadThread();
            if (socket != null) {
                socket.close();
                socket = null;
            }
            connectedDevice = null;
            notifyListeners("disconnect", new JSObject());
            call.resolve();
        } catch (Exception e) {
            call.reject("disconnect failed", e);
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value", "");
        if (socket == null || !socket.isConnected()) {
            call.reject("Not connected");
            return;
        }
        try {
            OutputStream out = socket.getOutputStream();
            out.write(value.getBytes());
            out.flush();
            call.resolve();
        } catch (IOException e) {
            call.reject("write failed", e);
        }
    }

    private void startReadThread() {
        stopReadThread();
        readThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    InputStream in = socket.getInputStream();
                    byte[] buffer = new byte[1024];
                    int len;
                    while (socket != null && socket.isConnected() && (len = in.read(buffer)) > 0) {
                        final String data = new String(buffer, 0, len, "UTF-8");
                        JSObject o = new JSObject();
                        o.put("value", data);
                        notifyListeners("data", o);
                    }
                } catch (IOException e) {
                    Log.i(TAG, "read thread ended", e);
                } finally {
                    try {
                        if (socket != null) socket.close();
                    } catch (IOException ignored) {}
                    socket = null;
                    connectedDevice = null;
                    notifyListeners("disconnect", new JSObject());
                }
            }
        });
        readThread.start();
    }

    private void stopReadThread() {
        if (readThread != null && readThread.isAlive()) {
            try { readThread.interrupt(); } catch (Exception ignored) {}
            readThread = null;
        }
    }
}
