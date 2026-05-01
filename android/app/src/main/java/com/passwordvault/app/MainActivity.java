package com.passwordvault.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.passwordvault.app.security.VaultShieldPlugin;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
  private static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 4102;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(VaultShieldPlugin.class);
    super.onCreate(savedInstanceState);
    requestBluetoothRuntimePermissionsIfNeeded();
  }

  @Override
  public void onBackPressed() {
    if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
      bridge.getWebView().goBack();
      return;
    }

    moveTaskToBack(true);
  }

  private void requestBluetoothRuntimePermissionsIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return;
    }

    String[] targetPermissions =
        new String[] {
          Manifest.permission.BLUETOOTH_CONNECT,
          Manifest.permission.BLUETOOTH_SCAN,
        };

    List<String> missingPermissions = new ArrayList<>();
    for (String permission : targetPermissions) {
      if (ContextCompat.checkSelfPermission(this, permission)
          != PackageManager.PERMISSION_GRANTED) {
        missingPermissions.add(permission);
      }
    }

    if (!missingPermissions.isEmpty()) {
      ActivityCompat.requestPermissions(
          this,
          missingPermissions.toArray(new String[0]),
          BLUETOOTH_PERMISSION_REQUEST_CODE
      );
    }
  }
}
