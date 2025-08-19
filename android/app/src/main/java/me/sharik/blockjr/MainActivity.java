package me.sharik.blockjr;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // If you need manual registration, uncomment & use:
    // this.registerPlugin(BluetoothSerialPlugin.class);

    // If you have others to register manually:
    // List<Class<? extends Plugin>> plugins = new ArrayList<>();
    // plugins.add(BluetoothSerialPlugin.class);
    // this.registerPlugins(plugins);
  }
}
