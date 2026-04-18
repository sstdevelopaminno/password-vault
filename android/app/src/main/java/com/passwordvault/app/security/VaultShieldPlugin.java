package com.passwordvault.app.security;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityServiceException;
import com.google.android.play.core.integrity.IntegrityTokenRequest;
import com.google.android.play.core.integrity.IntegrityTokenResponse;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

@CapacitorPlugin(name = "VaultShield")
public class VaultShieldPlugin extends Plugin {

  @PluginMethod
  public void collectSignals(PluginCall call) {
    Context context = getContext();
    PackageManager pm = context.getPackageManager();

    List<String> suspiciousPackages = getStringList(call.getArray("suspiciousPackages"));
    boolean scanLaunchableApps = call.getBoolean("scanLaunchableApps", true);
    String playIntegrityNonce = String.valueOf(call.getString("playIntegrityNonce", "")).trim();
    Long playIntegrityCloudProjectNumber = call.getLong("playIntegrityCloudProjectNumber");

    Set<String> detectedPackages = detectSuspiciousPackages(pm, suspiciousPackages, scanLaunchableApps);
    String installSource = getInstallSource(pm, context.getPackageName());

    JSObject result = new JSObject();
    result.put("platform", "android");
    result.put("collectedAt", nowIsoUtc());
    result.put("apiLevel", Build.VERSION.SDK_INT);
    result.put("packageName", context.getPackageName());
    result.put("installSource", installSource);
    result.put("isEmulator", isEmulator());
    result.put("isDebuggable", isDebuggable(context));
    result.put("hasTestKeys", hasTestKeys());
    result.put("suBinaryDetected", hasSuBinary());
    result.put("developerOptionsEnabled", isDeveloperOptionsEnabled(context));
    result.put("adbEnabled", isAdbEnabled(context));
    result.put("vpnActive", isVpnActive(context));
    result.put("packageVisibilityLimited", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !isQueryAllPackagesDeclared(pm, context.getPackageName()));
    result.put("queryAllPackagesDeclared", isQueryAllPackagesDeclared(pm, context.getPackageName()));
    result.put("scanMode", scanLaunchableApps ? "launcher-intent" : "explicit-package-check");
    result.put("suspiciousApps", new JSArray(new ArrayList<>(detectedPackages)));

    if (playIntegrityNonce.isEmpty() || playIntegrityCloudProjectNumber == null || playIntegrityCloudProjectNumber <= 0L) {
      result.put("playIntegrityStatus", "skipped");
      call.resolve(result);
      return;
    }

    requestPlayIntegrityToken(call, result, playIntegrityNonce, playIntegrityCloudProjectNumber);
  }

  private void requestPlayIntegrityToken(
    PluginCall call,
    JSObject result,
    String nonce,
    long cloudProjectNumber
  ) {
    try {
      IntegrityManager integrityManager = IntegrityManagerFactory.create(getContext());
      IntegrityTokenRequest request = IntegrityTokenRequest.builder()
        .setNonce(nonce)
        .setCloudProjectNumber(cloudProjectNumber)
        .build();

      integrityManager
        .requestIntegrityToken(request)
        .addOnSuccessListener((IntegrityTokenResponse response) -> {
          result.put("playIntegrityStatus", "ok");
          result.put("playIntegrityToken", response.token());
          call.resolve(result);
        })
        .addOnFailureListener((Exception error) -> {
          result.put("playIntegrityStatus", "error");
          result.put("playIntegrityError", error.getMessage());
          if (error instanceof IntegrityServiceException) {
            result.put("playIntegrityErrorCode", ((IntegrityServiceException) error).getErrorCode());
          }
          call.resolve(result);
        });
    } catch (Exception error) {
      result.put("playIntegrityStatus", "error");
      result.put("playIntegrityError", error.getMessage());
      call.resolve(result);
      return;
    }
  }

  @NonNull
  private List<String> getStringList(JSArray value) {
    List<String> output = new ArrayList<>();
    if (value == null) {
      return output;
    }

    for (int index = 0; index < value.length(); index++) {
      String item = value.optString(index, "").trim();
      if (!item.isEmpty()) {
        output.add(item);
      }
    }
    return output;
  }

  @NonNull
  private Set<String> detectSuspiciousPackages(PackageManager pm, List<String> suspiciousPackages, boolean scanLaunchableApps) {
    Set<String> results = new HashSet<>();
    if (suspiciousPackages.isEmpty()) {
      return results;
    }

    Set<String> launchablePackages = scanLaunchableApps ? getLaunchablePackages(pm) : new HashSet<>();

    for (String packageName : suspiciousPackages) {
      if (scanLaunchableApps && launchablePackages.contains(packageName)) {
        results.add(packageName);
        continue;
      }

      if (isPackageInstalled(pm, packageName)) {
        results.add(packageName);
      }
    }
    return results;
  }

  @NonNull
  private Set<String> getLaunchablePackages(PackageManager pm) {
    Set<String> packages = new HashSet<>();
    Intent intent = new Intent(Intent.ACTION_MAIN, null);
    intent.addCategory(Intent.CATEGORY_LAUNCHER);
    List<ResolveInfo> resolveInfos = pm.queryIntentActivities(intent, 0);
    for (ResolveInfo info : resolveInfos) {
      if (info == null || info.activityInfo == null) {
        continue;
      }
      String packageName = info.activityInfo.packageName;
      if (packageName != null && !packageName.trim().isEmpty()) {
        packages.add(packageName);
      }
    }
    return packages;
  }

  private boolean isPackageInstalled(PackageManager pm, String packageName) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0));
      } else {
        //noinspection deprecation
        pm.getPackageInfo(packageName, 0);
      }
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isQueryAllPackagesDeclared(PackageManager pm, String packageName) {
    try {
      PackageInfo info;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        info = pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS));
      } else {
        //noinspection deprecation
        info = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS);
      }

      if (info.requestedPermissions == null) {
        return false;
      }

      for (String permission : info.requestedPermissions) {
        if ("android.permission.QUERY_ALL_PACKAGES".equals(permission)) {
          return true;
        }
      }
      return false;
    } catch (Exception ignored) {
      return false;
    }
  }

  private String getInstallSource(PackageManager pm, String packageName) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        return pm.getInstallSourceInfo(packageName).getInstallingPackageName();
      }
      //noinspection deprecation
      return pm.getInstallerPackageName(packageName);
    } catch (Exception ignored) {
      return "";
    }
  }

  private boolean isDebuggable(Context context) {
    return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }

  private boolean hasTestKeys() {
    String tags = Build.TAGS;
    return tags != null && tags.contains("test-keys");
  }

  private boolean hasSuBinary() {
    String[] paths = new String[] {
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/system/app/Superuser.apk",
      "/system/bin/failsafe/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/data/local/su"
    };

    for (String path : paths) {
      if (new File(path).exists()) {
        return true;
      }
    }
    return false;
  }

  private boolean isDeveloperOptionsEnabled(Context context) {
    try {
      return Settings.Global.getInt(
        context.getContentResolver(),
        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
        0
      ) == 1;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isAdbEnabled(Context context) {
    try {
      return Settings.Global.getInt(
        context.getContentResolver(),
        Settings.Global.ADB_ENABLED,
        0
      ) == 1;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isVpnActive(Context context) {
    try {
      ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (connectivityManager == null) {
        return false;
      }

      Network activeNetwork = connectivityManager.getActiveNetwork();
      if (activeNetwork == null) {
        return false;
      }

      NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
      if (capabilities == null) {
        return false;
      }

      return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isEmulator() {
    return Build.FINGERPRINT.startsWith("generic")
      || Build.FINGERPRINT.toLowerCase().contains("emulator")
      || Build.MODEL.contains("Emulator")
      || Build.MODEL.contains("Android SDK built for x86")
      || Build.MANUFACTURER.contains("Genymotion")
      || Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")
      || "google_sdk".equals(Build.PRODUCT);
  }

  @NonNull
  private String nowIsoUtc() {
    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
    return formatter.format(new Date());
  }
}
