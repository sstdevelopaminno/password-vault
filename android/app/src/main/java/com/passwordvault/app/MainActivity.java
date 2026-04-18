package com.passwordvault.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.passwordvault.app.security.VaultShieldPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(VaultShieldPlugin.class);
    super.onCreate(savedInstanceState);
  }

  @Override
  public void onBackPressed() {
    if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
      bridge.getWebView().goBack();
      return;
    }

    moveTaskToBack(true);
  }
}
