package me.sharik.blockjr;

import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;

public class SerialService extends Service implements SerialListener {

    private static final String TAG = "SerialService";

    private final IBinder binder = new SerialBinder();
    private SerialSocket socket;
    public boolean connected = false;
    private SerialListener listener;

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
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        disconnect();
        super.onDestroy();
        Log.d(TAG, "onDestroy()");
    }

    public void attach(SerialListener listener) {
        this.listener = listener;
    }

    public void detach() {
        this.listener = null;
    }

    public void connect(SerialSocket socket) throws Exception {
        disconnect(); // close existing before new
        this.socket = socket;
        this.socket.connect(this); // ✅ pass SerialListener
        connected = true;
    }

    public void disconnect() {
        if (socket != null) {
            try { socket.disconnect(); } catch (Exception ignored) {}
            socket = null;
        }
        connected = false;
    }

    public void write(byte[] data) throws Exception {
        if (socket != null) {
            socket.write(data);
        } else {
            throw new Exception("No socket connected");
        }
    }

    // SerialListener callbacks
    @Override
    public void onSerialConnect() {
        if (listener != null) listener.onSerialConnect();
    }

    @Override
    public void onSerialConnectError(Exception e) {
        connected = false;
        if (listener != null) listener.onSerialConnectError(e);
    }

    @Override
    public void onSerialRead(byte[] data) {
        if (listener != null) listener.onSerialRead(data);
    }

    @Override
    public void onSerialRead(java.util.ArrayDeque<byte[]> datas) {
        if (listener != null) listener.onSerialRead(datas);
    }

    @Override
    public void onSerialIoError(Exception e) {
        connected = false;
        if (listener != null) listener.onSerialIoError(e);
    }
}
