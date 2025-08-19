package me.sharik.blockjr;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;

import java.io.IOException;

/**
 * SerialService - bound service used by BluetoothSerialPlugin.
 * Implements attach/detach/connect/disconnect/write used by the plugin.
 *
 * Note: This implementation assumes SerialSocket exposes:
 *   - void connect() throws Exception
 *   - void write(byte[] data) throws Exception
 *   - void close() throws IOException
 *
 * If your SerialSocket API differs, adjust method calls accordingly.
 */
public class SerialService extends Service {

    private static final String TAG = "SerialService";

    // Binder given to clients
    private final IBinder binder = new SerialBinder();

    // Listener (the plugin) which receives serial events
    private SerialListener listener;

    // Current socket used for communication
    private SerialSocket socket;

    // Connection state accessible to plugin
    public boolean connected = false;

    /**
     * Class used for the client Binder.
     * Because this service runs in the same process as its clients,
     * we can return a direct reference.
     */
    public class SerialBinder extends Binder {
        public SerialService getService() {
            return SerialService.this;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "onBind()");
        return binder;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate()");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand()");
        // If you want foreground notifications, create them here.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "onDestroy()");
        // Cleanup socket if still open
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (Exception ignored) {}
        socket = null;
        connected = false;
        listener = null;
    }

    // -----------------------
    // Methods used by plugin
    // -----------------------

    /**
     * Attach a listener (the plugin) to receive callbacks.
     */
    public void attach(SerialListener l) {
        this.listener = l;
    }

    /**
     * Detach the listener to avoid leaks.
     */
    public void detach() {
        this.listener = null;
    }

    /**
     * Connect using the provided SerialSocket.
     * This will attempt to connect synchronously and notify listener.
     *
     * @throws Exception when connection fails
     */
    public synchronized void connect(SerialSocket s) throws Exception {
        if (s == null) throw new IllegalArgumentException("socket is null");
        // Close previous socket if any
        try {
            if (this.socket != null) {
                try { this.socket.close(); } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}

        this.socket = s;
        try {
            this.socket.connect();
            this.connected = true;
            if (listener != null) {
                listener.onSerialConnect();
            }
        } catch (Exception e) {
            this.connected = false;
            if (listener != null) {
                listener.onSerialConnectError(e);
            }
            // rethrow so callers (plugin) know connect failed
            throw e;
        }
    }

    /**
     * Disconnect current socket and notify listener.
     */
    public synchronized void disconnect() {
        try {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
                socket = null;
            }
        } finally {
            boolean hadConnection = this.connected;
            this.connected = false;
            if (listener != null && hadConnection) {
                listener.onSerialIoError(new Exception("Disconnected"));
            }
        }
    }

    /**
     * Write bytes to the connected socket.
     *
     * @param data bytes to write
     * @throws Exception if not connected or write fails
     */
    public synchronized void write(byte[] data) throws Exception {
        if (!connected || socket == null) {
            throw new IllegalStateException("Not connected");
        }
        // delegate actual writing to SerialSocket
        socket.write(data);
    }

    // Example utility method
    public String getStatus() {
        return "SerialService running (connected=" + connected + ")";
    }
}
