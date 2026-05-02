package com.passwordvault.app.security;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.app.DownloadManager;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.TrafficStats;
import android.os.Build;
import android.os.Environment;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Log;
import android.webkit.URLUtil;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityServiceException;
import com.google.android.play.core.integrity.IntegrityTokenRequest;
import com.google.android.play.core.integrity.IntegrityTokenResponse;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.Executor;

@CapacitorPlugin(
  name = "VaultShield",
  permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
    @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
    @Permission(alias = "call_phone", strings = { Manifest.permission.CALL_PHONE })
  }
)
public class VaultShieldPlugin extends Plugin {
  private static final String TAG = "VaultShieldPlugin";
  private static final String APK_INSTALL_EVENT = "apkInstallState";
  private static final List<String> TRUSTED_INSTALLER_PREFIXES = Arrays.asList(
    "com.android.vending",
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.miui.packageinstaller",
    "com.samsung.android.packageinstaller",
    "com.sec.android.app.samsungapps",
    "com.samsung.android",
    "com.huawei.appmarket",
    "com.hihonor.appmarket",
    "com.xiaomi.market",
    "com.heytap.market",
    "com.coloros.appstore",
    "com.oppo.market",
    "com.vivo.appstore",
    "com.bbk.appstore",
    "com.oneplus",
    "com.amazon.venezia",
    "com.transsion"
  );
  private static final List<String> HIGH_RISK_PACKAGE_KEYWORDS = Arrays.asList(
    "hack",
    "crack",
    "keygen",
    "xposed",
    "magisk",
    "rootcloak",
    "inject",
    "trojan",
    "spyware",
    "malware",
    "keylogger",
    "rat",
    "modmenu"
  );
  private static final List<String> ADWARE_PACKAGE_KEYWORDS = Arrays.asList(
    "adservice",
    "adsdk",
    "adware",
    "pushads",
    "overlayads",
    "clicker"
  );
  private static final List<String> GAME_PACKAGE_KEYWORDS = Arrays.asList(
    "game",
    "gaming",
    "casino",
    "slot",
    "bet"
  );
  private static final List<String> CRITICAL_PERMISSION_MARKERS = Arrays.asList(
    Manifest.permission.SEND_SMS,
    Manifest.permission.RECEIVE_SMS,
    Manifest.permission.READ_SMS,
    Manifest.permission.RECEIVE_MMS,
    Manifest.permission.RECEIVE_WAP_PUSH,
    Manifest.permission.SYSTEM_ALERT_WINDOW,
    Manifest.permission.REQUEST_INSTALL_PACKAGES,
    Manifest.permission.RECEIVE_BOOT_COMPLETED,
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
    "android.permission.BIND_DEVICE_ADMIN",
    "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
  );
  private BroadcastReceiver apkDownloadReceiver;
  private long pendingApkDownloadId = -1L;
  private Uri pendingApkUri;
  private String pendingApkFileName = "";

  @PluginMethod
  public void requestCameraPermission(PluginCall call) {
    PermissionState state = getPermissionState("camera");
    if (state == PermissionState.GRANTED) {
      JSObject payload = new JSObject();
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    requestPermissionForAlias("camera", call, "cameraPermissionCallback");
  }

  @PluginMethod
  public void requestContactsPermission(PluginCall call) {
    PermissionState state = getPermissionState("contacts");
    if (state == PermissionState.GRANTED) {
      JSObject payload = new JSObject();
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
  }

  @PluginMethod
  public void requestCallPhonePermission(PluginCall call) {
    PermissionState state = getPermissionState("call_phone");
    if (state == PermissionState.GRANTED) {
      JSObject payload = new JSObject();
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    requestPermissionForAlias("call_phone", call, "callPhonePermissionCallback");
  }

  @PermissionCallback
  private void cameraPermissionCallback(PluginCall call) {
    if (call == null) {
      return;
    }

    PermissionState state = getPermissionState("camera");
    JSObject payload = new JSObject();
    if (state == PermissionState.GRANTED) {
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    boolean permanentlyDenied = false;
    try {
      if (getActivity() != null) {
        permanentlyDenied =
          !getActivity().shouldShowRequestPermissionRationale(Manifest.permission.CAMERA);
      }
    } catch (Exception ignored) {
      permanentlyDenied = false;
    }

    payload.put("status", permanentlyDenied ? "denied_permanently" : "denied");
    call.resolve(payload);
  }

  @PermissionCallback
  private void contactsPermissionCallback(PluginCall call) {
    if (call == null) {
      return;
    }

    PermissionState state = getPermissionState("contacts");
    JSObject payload = new JSObject();
    if (state == PermissionState.GRANTED) {
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    boolean permanentlyDenied = false;
    try {
      if (getActivity() != null) {
        permanentlyDenied =
          !getActivity().shouldShowRequestPermissionRationale(Manifest.permission.READ_CONTACTS);
      }
    } catch (Exception ignored) {
      permanentlyDenied = false;
    }

    payload.put("status", permanentlyDenied ? "denied_permanently" : "denied");
    call.resolve(payload);
  }

  @PermissionCallback
  private void callPhonePermissionCallback(PluginCall call) {
    if (call == null) {
      return;
    }

    PermissionState state = getPermissionState("call_phone");
    JSObject payload = new JSObject();
    if (state == PermissionState.GRANTED) {
      payload.put("status", "granted");
      call.resolve(payload);
      return;
    }

    boolean permanentlyDenied = false;
    try {
      if (getActivity() != null) {
        permanentlyDenied =
          !getActivity().shouldShowRequestPermissionRationale(Manifest.permission.CALL_PHONE);
      }
    } catch (Exception ignored) {
      permanentlyDenied = false;
    }

    payload.put("status", permanentlyDenied ? "denied_permanently" : "denied");
    call.resolve(payload);
  }

  @PluginMethod
  public void getDeviceContacts(PluginCall call) {
    PermissionState state = getPermissionState("contacts");
    if (state != PermissionState.GRANTED) {
      JSObject payload = new JSObject();
      payload.put("permission", "denied");
      payload.put("contacts", new JSArray());
      call.resolve(payload);
      return;
    }

    int limit = 300;
    Integer requestedLimit = call.getInt("limit");
    if (requestedLimit != null && requestedLimit > 0) {
      limit = Math.min(requestedLimit, 1000);
    }

    JSArray contacts = new JSArray();
    Set<String> dedupe = new HashSet<>();

    String[] projection = new String[] {
      ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
      ContactsContract.CommonDataKinds.Phone.NUMBER,
      ContactsContract.CommonDataKinds.Phone.TYPE,
    };

    Cursor cursor = null;
    try {
      cursor = getContext().getContentResolver().query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        null,
        null,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
      );

      if (cursor == null) {
        JSObject payload = new JSObject();
        payload.put("permission", "granted");
        payload.put("contacts", contacts);
        payload.put("count", 0);
        payload.put("source", "device");
        call.resolve(payload);
        return;
      }

      int idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
      int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
      int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
      int typeIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.TYPE);

      while (cursor.moveToNext() && contacts.length() < limit) {
        String id = idIndex >= 0 ? String.valueOf(cursor.getLong(idIndex)) : String.valueOf(contacts.length() + 1);
        String name = nameIndex >= 0 ? String.valueOf(cursor.getString(nameIndex)) : "";
        String number = numberIndex >= 0 ? String.valueOf(cursor.getString(numberIndex)) : "";
        int type = typeIndex >= 0 ? cursor.getInt(typeIndex) : ContactsContract.CommonDataKinds.Phone.TYPE_OTHER;

        if (number == null || number.trim().isEmpty()) {
          continue;
        }

        String normalized = number.replaceAll("[^0-9]", "");
        if (normalized.isEmpty() || dedupe.contains(normalized)) {
          continue;
        }
        dedupe.add(normalized);

        JSObject row = new JSObject();
        row.put("id", id);
        row.put("name", (name == null || name.trim().isEmpty()) ? "Unknown" : name.trim());
        row.put("number", number.trim());
        row.put("label", mapContactLabel(type));
        contacts.put(row);
      }

      JSObject payload = new JSObject();
      payload.put("permission", "granted");
      payload.put("contacts", contacts);
      payload.put("count", contacts.length());
      payload.put("source", "device");
      call.resolve(payload);
    } catch (Exception error) {
      call.reject("Unable to read contacts: " + error.getMessage());
    } finally {
      if (cursor != null) {
        cursor.close();
      }
    }
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    Context context = getContext();
    try {
      Intent settingsIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      settingsIntent.setData(Uri.fromParts("package", context.getPackageName(), null));
      settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(settingsIntent);

      JSObject payload = new JSObject();
      payload.put("opened", true);
      call.resolve(payload);
    } catch (Exception error) {
      call.reject("Unable to open app settings: " + error.getMessage());
    }
  }

  @PluginMethod
  public void installApkUpdate(PluginCall call) {
    Context context = getContext();
    String downloadUrl = String.valueOf(call.getString("downloadUrl", "")).trim();
    if (downloadUrl.isEmpty()) {
      call.reject("downloadUrl is required");
      return;
    }

    if (!downloadUrl.startsWith("http://") && !downloadUrl.startsWith("https://")) {
      call.reject("downloadUrl must use http/https");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      boolean canInstall = context.getPackageManager().canRequestPackageInstalls();
      if (!canInstall) {
        boolean opened = openUnknownAppSourcesSettings(context);
        JSObject payload = new JSObject();
        payload.put("status", "permission_required");
        payload.put("requiresUserAction", true);
        payload.put("settingsOpened", opened);
        payload.put(
          "message",
          opened
            ? "Allow install unknown apps, then return to the app. Update will continue."
            : "Please enable Install unknown apps for Vault in Android settings."
        );
        call.resolve(payload);
        return;
      }
    }

    DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
    if (downloadManager == null) {
      call.reject("DownloadManager is unavailable");
      return;
    }

    String requestedFileName = String.valueOf(call.getString("fileName", "")).trim();
    String fileName = requestedFileName.isEmpty() ? URLUtil.guessFileName(downloadUrl, null, "application/vnd.android.package-archive") : requestedFileName;
    if (fileName.isEmpty()) {
      fileName = "vault-update-" + System.currentTimeMillis() + ".apk";
    }
    if (!fileName.endsWith(".apk")) {
      fileName = fileName + ".apk";
    }

    String title = String.valueOf(call.getString("title", "Vault update")).trim();
    String description = String.valueOf(call.getString("description", "Downloading update package")).trim();

    try {
      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl));
      request.setAllowedOverMetered(true);
      request.setAllowedOverRoaming(true);
      request.setMimeType("application/vnd.android.package-archive");
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
      request.setTitle(title);
      request.setDescription(description);

      long downloadId = downloadManager.enqueue(request);
      registerApkDownloadReceiver(downloadManager);
      pendingApkDownloadId = downloadId;
      pendingApkUri = null;
      pendingApkFileName = fileName;

      JSObject payload = new JSObject();
      payload.put("status", "downloading");
      payload.put("downloadId", downloadId);
      payload.put("fileName", fileName);
      payload.put("requiresUserAction", true);
      call.resolve(payload);
    } catch (Exception error) {
      call.reject("Unable to start APK download: " + error.getMessage());
    }
  }

  @PluginMethod
  public void collectSignals(PluginCall call) {
    Context context = getContext();
    PackageManager pm = context.getPackageManager();

    List<String> suspiciousPackages = getStringList(call.getArray("suspiciousPackages"));
    boolean scanLaunchableApps = call.getBoolean("scanLaunchableApps", true);
    String playIntegrityNonce = String.valueOf(call.getString("playIntegrityNonce", "")).trim();
    Long playIntegrityCloudProjectNumber = call.getLong("playIntegrityCloudProjectNumber");

    Set<String> detectedPackages = detectSuspiciousPackages(pm, suspiciousPackages, scanLaunchableApps);
    Set<String> launchablePackages = scanLaunchableApps ? getLaunchablePackages(pm) : new HashSet<>();
    JSObject riskyScanSummary = scanLaunchableRiskSignals(pm, launchablePackages);
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
    result.put("riskyInstallerApps", riskyScanSummary.optJSONArray("riskyInstallerApps"));
    result.put("heuristicRiskyApps", riskyScanSummary.optJSONArray("heuristicRiskyApps"));
    result.put("highRiskPackageKeywordApps", riskyScanSummary.optJSONArray("highRiskPackageKeywordApps"));
    result.put("adwareLikeApps", riskyScanSummary.optJSONArray("adwareLikeApps"));
    result.put("gameLikeApps", riskyScanSummary.optJSONArray("gameLikeApps"));
    result.put("unknownInstallerCount", riskyScanSummary.optInt("unknownInstallerCount", 0));
    result.put("heuristicRiskyAppCount", riskyScanSummary.optInt("heuristicRiskyAppCount", 0));
    result.put("adwareLikeCount", riskyScanSummary.optInt("adwareLikeCount", 0));
    result.put("gameLikeCount", riskyScanSummary.optInt("gameLikeCount", 0));

    if (playIntegrityNonce.isEmpty() || playIntegrityCloudProjectNumber == null || playIntegrityCloudProjectNumber <= 0L) {
      result.put("playIntegrityStatus", "skipped");
      call.resolve(result);
      return;
    }

    requestPlayIntegrityToken(call, result, playIntegrityNonce, playIntegrityCloudProjectNumber);
  }

  @PluginMethod
  public void openPendingApkInstaller(PluginCall call) {
    Context context = getContext();
    if (pendingApkUri == null) {
      JSObject payload = new JSObject();
      payload.put("status", "no_pending_apk");
      payload.put("installerOpened", false);
      call.resolve(payload);
      return;
    }

    boolean installerOpened = false;
    boolean downloadsOpened = false;
    try {
      installerOpened = openApkInstaller(context, pendingApkUri);
      if (!installerOpened) {
        downloadsOpened = openDownloadsUi(context);
      }
    } catch (Exception error) {
      Log.e(TAG, "Unable to open pending APK installer", error);
      downloadsOpened = openDownloadsUi(context);
    }

    JSObject payload = new JSObject();
    payload.put("status", installerOpened ? "installer_opened" : "installer_blocked");
    payload.put("installerOpened", installerOpened);
    payload.put("downloadsOpened", downloadsOpened);
    payload.put("fileName", pendingApkFileName);
    payload.put("requiresUserAction", true);
    call.resolve(payload);
  }

  @PluginMethod
  public void getDeviceSecurityState(PluginCall call) {
    try {
      JSObject state = buildDeviceSecurityState(getContext());
      call.resolve(state);
    } catch (Exception error) {
      call.reject("Unable to read device security state: " + error.getMessage());
    }
  }

  @PluginMethod
  public void getBiometricStatus(PluginCall call) {
    JSObject payload = new JSObject();
    int apiLevel = Build.VERSION.SDK_INT;
    payload.put("apiLevel", apiLevel);
    payload.put("android12OrNewer", apiLevel >= Build.VERSION_CODES.S);

    if (apiLevel < Build.VERSION_CODES.M) {
      payload.put("supported", false);
      payload.put("available", false);
      payload.put("enrolled", false);
      payload.put("reason", "android_version_unsupported");
      call.resolve(payload);
      return;
    }

    try {
      BiometricManager biometricManager = BiometricManager.from(getContext());
      int statusCode = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
      payload.put("supported", true);
      payload.put("statusCode", statusCode);

      if (statusCode == BiometricManager.BIOMETRIC_SUCCESS) {
        payload.put("available", true);
        payload.put("enrolled", true);
        payload.put("reason", "ready");
      } else if (statusCode == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
        payload.put("available", false);
        payload.put("enrolled", false);
        payload.put("reason", "none_enrolled");
      } else if (statusCode == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
        payload.put("available", false);
        payload.put("enrolled", false);
        payload.put("reason", "hardware_unavailable");
      } else if (statusCode == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED) {
        payload.put("available", false);
        payload.put("enrolled", false);
        payload.put("reason", "security_update_required");
      } else if (statusCode == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
        payload.put("available", false);
        payload.put("enrolled", false);
        payload.put("reason", "unsupported");
      } else {
        payload.put("available", false);
        payload.put("enrolled", false);
        payload.put("reason", "unknown");
      }
    } catch (Exception error) {
      payload.put("supported", false);
      payload.put("available", false);
      payload.put("enrolled", false);
      payload.put("reason", "unknown");
    }

    call.resolve(payload);
  }

  @PluginMethod
  public void authenticateBiometric(PluginCall call) {
    JSObject unsupportedPayload = new JSObject();
    unsupportedPayload.put("success", false);
    unsupportedPayload.put("fallbackToPin", true);

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      unsupportedPayload.put("status", "android_version_unsupported");
      call.resolve(unsupportedPayload);
      return;
    }

    if (!(getActivity() instanceof FragmentActivity)) {
      unsupportedPayload.put("status", "unsupported");
      call.resolve(unsupportedPayload);
      return;
    }

    BiometricManager biometricManager = BiometricManager.from(getContext());
    int statusCode = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
    if (statusCode != BiometricManager.BIOMETRIC_SUCCESS) {
      unsupportedPayload.put("status", mapBiometricAvailabilityStatus(statusCode));
      unsupportedPayload.put("errorCode", statusCode);
      call.resolve(unsupportedPayload);
      return;
    }

    FragmentActivity activity = (FragmentActivity) getActivity();
    Executor executor = ContextCompat.getMainExecutor(activity);
    String title = String.valueOf(call.getString("title", "Verify identity")).trim();
    String subtitle = String.valueOf(call.getString("subtitle", "")).trim();
    String negativeButtonText = String.valueOf(call.getString("negativeButtonText", "Use PIN")).trim();

    final boolean[] completed = new boolean[] { false };
    BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
      @Override
      public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
        if (completed[0]) return;
        completed[0] = true;
        JSObject payload = new JSObject();
        payload.put("success", false);
        payload.put("status", mapBiometricErrorStatus(errorCode));
        payload.put("errorCode", errorCode);
        payload.put("errorMessage", String.valueOf(errString));
        payload.put("fallbackToPin", true);
        call.resolve(payload);
      }

      @Override
      public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
        if (completed[0]) return;
        completed[0] = true;
        JSObject payload = new JSObject();
        payload.put("success", true);
        payload.put("status", "authenticated");
        payload.put("fallbackToPin", false);
        call.resolve(payload);
      }

      @Override
      public void onAuthenticationFailed() {
        super.onAuthenticationFailed();
      }
    };

    BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor, callback);

    BiometricPrompt.PromptInfo.Builder promptBuilder = new BiometricPrompt.PromptInfo.Builder()
      .setTitle(title.isEmpty() ? "Verify identity" : title)
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
      .setNegativeButtonText(negativeButtonText.isEmpty() ? "Use PIN" : negativeButtonText);

    if (!subtitle.isEmpty()) {
      promptBuilder.setSubtitle(subtitle);
    }

    biometricPrompt.authenticate(promptBuilder.build());
  }

  @PluginMethod
  public void scanInstalledApps(PluginCall call) {
    Context context = getContext();
    PackageManager pm = context.getPackageManager();
    int limit = 240;
    Integer requestedLimit = call.getInt("limit");
    if (requestedLimit != null && requestedLimit > 0) {
      limit = Math.min(500, requestedLimit);
    }

    Set<String> launchablePackages = getLaunchablePackages(pm);
    Set<String> enabledAccessibilityPackages =
      parseEnabledServicePackages(Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES));
    Set<String> enabledNotificationPackages =
      parseEnabledServicePackages(Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners"));
    Set<String> deviceAdminPackages = new HashSet<>();
    try {
      DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
      if (dpm != null) {
        List<ComponentName> activeAdmins = dpm.getActiveAdmins();
        if (activeAdmins != null) {
          for (ComponentName component : activeAdmins) {
            if (component != null && component.getPackageName() != null) {
              deviceAdminPackages.add(component.getPackageName());
            }
          }
        }
      }
    } catch (Exception ignored) {
      // no-op
    }

    JSArray apps = new JSArray();
    int scanned = 0;
    for (String packageName : launchablePackages) {
      if (scanned >= limit) break;
      if (packageName == null || packageName.trim().isEmpty()) continue;

      try {
        PackageInfo info;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          info = pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS));
        } else {
          //noinspection deprecation
          info = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS);
        }

        ApplicationInfo appInfo = info.applicationInfo;
        String appName = appInfo == null ? packageName : String.valueOf(pm.getApplicationLabel(appInfo));
        String installer = getInstallSource(pm, packageName);
        String[] requestedPermissions = info.requestedPermissions == null ? new String[0] : info.requestedPermissions;
        Set<String> permissionSet = new HashSet<>(Arrays.asList(requestedPermissions));

        boolean hasSmsPermission =
          permissionSet.contains(Manifest.permission.SEND_SMS) ||
          permissionSet.contains(Manifest.permission.RECEIVE_SMS) ||
          permissionSet.contains(Manifest.permission.READ_SMS);
        boolean hasAccessibilityPermission = permissionSet.contains("android.permission.BIND_ACCESSIBILITY_SERVICE");
        boolean hasDeviceAdminPermission = permissionSet.contains("android.permission.BIND_DEVICE_ADMIN");
        boolean hasOverlayPermission = permissionSet.contains(Manifest.permission.SYSTEM_ALERT_WINDOW);
        boolean hasNotificationListenerPermission = permissionSet.contains("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE");
        boolean hasInstallPackagePermission = permissionSet.contains(Manifest.permission.REQUEST_INSTALL_PACKAGES);
        boolean hasBootPermission = permissionSet.contains(Manifest.permission.RECEIVE_BOOT_COMPLETED);

        boolean accessibilityEnabled = enabledAccessibilityPackages.contains(packageName);
        boolean notificationEnabled = enabledNotificationPackages.contains(packageName);
        boolean deviceAdminActive = deviceAdminPackages.contains(packageName);
        boolean unknownInstaller = isLikelyUnknownInstallerApp(pm, context, packageName, installer);
        boolean suspiciousKeyword =
          containsAnyKeyword(packageName.toLowerCase(Locale.US), HIGH_RISK_PACKAGE_KEYWORDS) ||
          containsAnyKeyword(packageName.toLowerCase(Locale.US), ADWARE_PACKAGE_KEYWORDS);

        int dangerousPermissionCount = 0;
        for (String marker : CRITICAL_PERMISSION_MARKERS) {
          if (permissionSet.contains(marker)) {
            dangerousPermissionCount += 1;
          }
        }

        int uid = appInfo == null ? -1 : appInfo.uid;
        long rxBytes = uid > 0 ? Math.max(0L, TrafficStats.getUidRxBytes(uid)) : 0L;
        long txBytes = uid > 0 ? Math.max(0L, TrafficStats.getUidTxBytes(uid)) : 0L;
        long networkBytes = rxBytes + txBytes;

        int riskScore = 0;
        List<String> reasons = new ArrayList<>();

        if (hasSmsPermission) {
          riskScore += 26;
          reasons.add("requests SMS permissions");
        }
        if (hasAccessibilityPermission || accessibilityEnabled) {
          riskScore += 24;
          reasons.add(accessibilityEnabled ? "accessibility service currently enabled" : "declares accessibility service permission");
        }
        if (hasDeviceAdminPermission || deviceAdminActive) {
          riskScore += 20;
          reasons.add(deviceAdminActive ? "device admin currently active" : "declares device admin permission");
        }
        if (hasOverlayPermission) {
          riskScore += 14;
          reasons.add("can draw over other apps");
        }
        if (hasNotificationListenerPermission || notificationEnabled) {
          riskScore += 14;
          reasons.add(notificationEnabled ? "notification access currently enabled" : "declares notification listener permission");
        }
        if (hasInstallPackagePermission) {
          riskScore += 12;
          reasons.add("can request package installs");
        }
        if (hasBootPermission) {
          riskScore += 8;
          reasons.add("starts on boot");
        }
        if (unknownInstaller) {
          riskScore += 10;
          reasons.add("installed from unknown store");
        }
        if (suspiciousKeyword) {
          riskScore += 16;
          reasons.add("package name matches risky keyword pattern");
        }
        if (networkBytes > 300L * 1024L * 1024L) {
          riskScore += 16;
          reasons.add("abnormally high network usage");
        } else if (networkBytes > 120L * 1024L * 1024L) {
          riskScore += 8;
          reasons.add("high network usage");
        }
        if (dangerousPermissionCount >= 6) {
          riskScore += 14;
          reasons.add("many high-risk permissions");
        } else if (dangerousPermissionCount >= 3) {
          riskScore += 8;
          reasons.add("multiple high-risk permissions");
        }

        if (riskScore > 100) riskScore = 100;
        String riskLevel;
        String recommendation;
        if (riskScore >= 75) {
          riskLevel = "remove";
          recommendation = "uninstall";
        } else if (riskScore >= 50) {
          riskLevel = "risky";
          recommendation = "verify";
        } else if (riskScore >= 25) {
          riskLevel = "review";
          recommendation = "verify";
        } else {
          riskLevel = "safe";
          recommendation = "allow";
        }

        JSArray permissionsJson = new JSArray();
        for (String permission : requestedPermissions) {
          if (permission != null && !permission.trim().isEmpty()) {
            permissionsJson.put(permission);
          }
        }

        JSArray reasonsJson = new JSArray();
        for (String reason : reasons) {
          reasonsJson.put(reason);
        }

        JSObject row = new JSObject();
        row.put("packageName", packageName);
        row.put("appName", appName);
        row.put("installer", installer == null ? "" : installer);
        row.put("riskScore", riskScore);
        row.put("riskLevel", riskLevel);
        row.put("recommendation", recommendation);
        row.put("dangerousPermissionCount", dangerousPermissionCount);
        row.put("hasSmsPermission", hasSmsPermission);
        row.put("accessibilityEnabled", hasAccessibilityPermission || accessibilityEnabled);
        row.put("deviceAdminActive", hasDeviceAdminPermission || deviceAdminActive);
        row.put("canDisplayOverlay", hasOverlayPermission);
        row.put("notificationAccessEnabled", hasNotificationListenerPermission || notificationEnabled);
        row.put("canInstallPackages", hasInstallPackagePermission);
        row.put("bootAutoStart", hasBootPermission);
        row.put("hasSuspiciousKeyword", suspiciousKeyword);
        row.put("networkRxBytes", rxBytes);
        row.put("networkTxBytes", txBytes);
        row.put("reasons", reasonsJson);
        row.put("requestedPermissions", permissionsJson);
        apps.put(row);
        scanned += 1;
      } catch (Exception ignored) {
        // Skip packages that cannot be inspected due to visibility/signature restrictions.
      }
    }

    JSObject payload = new JSObject();
    payload.put("scannedAt", nowIsoUtc());
    payload.put("count", apps.length());
    payload.put("apps", apps);
    call.resolve(payload);
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

  private void registerApkDownloadReceiver(DownloadManager downloadManager) {
    Context context = getContext();
    unregisterApkDownloadReceiver();

    apkDownloadReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context receiverContext, Intent intent) {
        if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
          return;
        }

        long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
        if (downloadId <= 0L || downloadId != pendingApkDownloadId) {
          return;
        }

        try {
          DownloadManager.Query query = new DownloadManager.Query();
          query.setFilterById(downloadId);
          Cursor cursor = downloadManager.query(query);
          if (cursor == null) {
            return;
          }

          try {
            if (!cursor.moveToFirst()) {
              return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
            if (statusIndex < 0) {
              return;
            }

            int status = cursor.getInt(statusIndex);
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
              if (reasonIndex >= 0) {
                int reason = cursor.getInt(reasonIndex);
                Log.e(TAG, "APK download failed. reason=" + reason);
              } else {
                Log.e(TAG, "APK download failed with status=" + status);
              }
              return;
            }
          } finally {
            cursor.close();
          }

          Uri apkUri = downloadManager.getUriForDownloadedFile(downloadId);
          if (apkUri == null) {
            Log.e(TAG, "APK download completed but URI is null");
            emitApkInstallEvent("download_failed", "Download completed but APK URI is unavailable", false, false, false);
            return;
          }

          pendingApkUri = apkUri;

          boolean installerOpened = openApkInstaller(context, apkUri);
          if (!installerOpened) {
            Log.e(TAG, "No available activity can handle APK install intent; opening downloads UI");
            boolean downloadsOpened = openDownloadsUi(context);
            emitApkInstallEvent(
              "installer_blocked",
              downloadsOpened
                ? "Installer was blocked by system policy. Downloads screen opened."
                : "Installer was blocked by system policy. Open Downloads and install manually.",
              true,
              downloadsOpened,
              false
            );
            return;
          }

          emitApkInstallEvent("installer_opened", "Installer opened", true, false, true);
        } catch (Exception error) {
          Log.e(TAG, "Failed to open APK installer", error);
          boolean downloadsOpened = openDownloadsUi(context);
          emitApkInstallEvent(
            "installer_error",
            error.getMessage() == null ? "Unable to open installer" : error.getMessage(),
            true,
            downloadsOpened,
            false
          );
        } finally {
          pendingApkDownloadId = -1L;
          unregisterApkDownloadReceiver();
        }
      }
    };

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(apkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
      return;
    }

    context.registerReceiver(apkDownloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
  }

  private void unregisterApkDownloadReceiver() {
    if (apkDownloadReceiver == null) {
      return;
    }

    try {
      getContext().unregisterReceiver(apkDownloadReceiver);
    } catch (Exception ignored) {
      // no-op
    } finally {
      apkDownloadReceiver = null;
    }
  }

  private boolean openApkInstaller(Context context, Uri apkUri) {
    Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
    installIntent.setData(apkUri);
    installIntent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
    installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, false);
    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

    if (installIntent.resolveActivity(context.getPackageManager()) != null) {
      context.startActivity(installIntent);
      return true;
    }

    Intent fallback = new Intent(Intent.ACTION_VIEW);
    fallback.setDataAndType(apkUri, "application/vnd.android.package-archive");
    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    if (fallback.resolveActivity(context.getPackageManager()) != null) {
      context.startActivity(fallback);
      return true;
    }

    return false;
  }

  private boolean openDownloadsUi(Context context) {
    try {
      Intent intent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      if (intent.resolveActivity(context.getPackageManager()) != null) {
        context.startActivity(intent);
        return true;
      }
    } catch (Exception error) {
      Log.e(TAG, "Unable to open downloads UI", error);
    }
    return false;
  }

  private boolean openUnknownAppSourcesSettings(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      Intent legacySecurity = new Intent(Settings.ACTION_SECURITY_SETTINGS);
      return safeStartActivity(context, legacySecurity) || safeStartActivity(context, new Intent(Settings.ACTION_SETTINGS));
    }

    Intent scopedUnknownSources = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
    scopedUnknownSources.setData(Uri.parse("package:" + context.getPackageName()));

    Intent globalUnknownSources = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
    Intent securitySettings = new Intent(Settings.ACTION_SECURITY_SETTINGS);
    Intent genericSettings = new Intent(Settings.ACTION_SETTINGS);

    return safeStartActivity(context, scopedUnknownSources)
      || safeStartActivity(context, globalUnknownSources)
      || safeStartActivity(context, securitySettings)
      || safeStartActivity(context, genericSettings);
  }

  private boolean safeStartActivity(Context context, Intent intent) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      if (intent.resolveActivity(context.getPackageManager()) == null) {
        return false;
      }
      context.startActivity(intent);
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private void emitApkInstallEvent(
    String status,
    String message,
    boolean requiresUserAction,
    boolean settingsOpened,
    boolean installerOpened
  ) {
    JSObject payload = new JSObject();
    payload.put("status", status);
    payload.put("message", message == null ? "" : message);
    payload.put("requiresUserAction", requiresUserAction);
    payload.put("settingsOpened", settingsOpened);
    payload.put("installerOpened", installerOpened);
    payload.put("fileName", pendingApkFileName);
    payload.put("downloadId", pendingApkDownloadId);
    notifyListeners(APK_INSTALL_EVENT, payload, true);
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
  private JSObject scanLaunchableRiskSignals(PackageManager pm, Set<String> launchablePackages) {
    JSArray riskyInstallerApps = new JSArray();
    JSArray heuristicRiskyApps = new JSArray();
    JSArray highRiskKeywordApps = new JSArray();
    JSArray adwareLikeApps = new JSArray();
    JSArray gameLikeApps = new JSArray();

    int unknownInstallerCount = 0;
    int heuristicRiskyAppCount = 0;
    int adwareLikeCount = 0;
    int gameLikeCount = 0;

    for (String packageName : launchablePackages) {
      if (packageName == null || packageName.trim().isEmpty()) {
        continue;
      }

      String normalized = packageName.toLowerCase(Locale.US);
      String installer = getInstallSource(pm, packageName);
      boolean trustedInstaller = !isLikelyUnknownInstallerApp(pm, getContext(), packageName, installer);

      if (!trustedInstaller) {
        unknownInstallerCount += 1;
        if (riskyInstallerApps.length() < 80) {
          riskyInstallerApps.put(packageName + "|" + (installer == null ? "" : installer));
        }
      }

      boolean hasHighRiskKeyword = containsAnyKeyword(normalized, HIGH_RISK_PACKAGE_KEYWORDS);
      boolean hasAdwareKeyword = containsAnyKeyword(normalized, ADWARE_PACKAGE_KEYWORDS);
      boolean hasGameKeyword = containsAnyKeyword(normalized, GAME_PACKAGE_KEYWORDS);

      if (hasHighRiskKeyword) {
        heuristicRiskyAppCount += 1;
        if (highRiskKeywordApps.length() < 80) {
          highRiskKeywordApps.put(packageName);
        }
      }
      if (hasAdwareKeyword) {
        adwareLikeCount += 1;
        if (adwareLikeApps.length() < 80) {
          adwareLikeApps.put(packageName);
        }
      }
      if (hasGameKeyword) {
        gameLikeCount += 1;
        if (gameLikeApps.length() < 80) {
          gameLikeApps.put(packageName);
        }
      }

      if ((hasHighRiskKeyword || hasAdwareKeyword || !trustedInstaller) && heuristicRiskyApps.length() < 120) {
        heuristicRiskyApps.put(packageName);
      }
    }

    JSObject summary = new JSObject();
    summary.put("riskyInstallerApps", riskyInstallerApps);
    summary.put("heuristicRiskyApps", heuristicRiskyApps);
    summary.put("highRiskPackageKeywordApps", highRiskKeywordApps);
    summary.put("adwareLikeApps", adwareLikeApps);
    summary.put("gameLikeApps", gameLikeApps);
    summary.put("unknownInstallerCount", unknownInstallerCount);
    summary.put("heuristicRiskyAppCount", heuristicRiskyAppCount);
    summary.put("adwareLikeCount", adwareLikeCount);
    summary.put("gameLikeCount", gameLikeCount);
    return summary;
  }

  private boolean containsAnyKeyword(String value, List<String> keywords) {
    if (value == null || value.trim().isEmpty()) {
      return false;
    }

    for (String keyword : keywords) {
      if (keyword != null && !keyword.trim().isEmpty() && value.contains(keyword)) {
        return true;
      }
    }
    return false;
  }

  private boolean isTrustedInstaller(String installerPackage) {
    if (installerPackage == null || installerPackage.trim().isEmpty()) {
      return false;
    }

    String normalized = installerPackage.toLowerCase(Locale.US);
    for (String trustedPrefix : TRUSTED_INSTALLER_PREFIXES) {
      if (normalized.startsWith(trustedPrefix)) {
        return true;
      }
    }
    return false;
  }

  private boolean isSystemPackage(PackageManager pm, String packageName) {
    try {
      ApplicationInfo appInfo;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appInfo = pm.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0));
      } else {
        //noinspection deprecation
        appInfo = pm.getApplicationInfo(packageName, 0);
      }

      boolean system = (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
      boolean updatedSystem = (appInfo.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
      return system || updatedSystem;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isLikelyUnknownInstallerApp(
    PackageManager pm,
    Context context,
    String packageName,
    String installerPackage
  ) {
    if (packageName == null || packageName.trim().isEmpty()) {
      return false;
    }

    if (context != null && packageName.equals(context.getPackageName())) {
      return false;
    }

    if (isSystemPackage(pm, packageName)) {
      return false;
    }

    return !isTrustedInstaller(installerPackage);
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

  private JSObject buildDeviceSecurityState(Context context) {
    JSObject result = new JSObject();
    result.put("collectedAt", nowIsoUtc());
    result.put("playProtectEnabled", isPlayProtectEnabled(context));
    result.put("securityPatchLevel", String.valueOf(Build.VERSION.SECURITY_PATCH == null ? "" : Build.VERSION.SECURITY_PATCH));
    result.put("unknownSourcesEnabled", isUnknownSourcesEnabled(context));
    result.put("developerOptionsEnabled", isDeveloperOptionsEnabled(context));
    result.put("adbEnabled", isAdbEnabled(context));
    result.put("vpnActive", isVpnActive(context));
    result.put("activeWifi", isActiveWifi(context));
    result.put("overlayPermissionGrantedToVault", Settings.canDrawOverlays(context));
    result.put("suBinaryDetected", hasSuBinary());
    result.put("hasTestKeys", hasTestKeys());
    return result;
  }

  private Set<String> parseEnabledServicePackages(String rawValue) {
    Set<String> packages = new HashSet<>();
    if (rawValue == null || rawValue.trim().isEmpty()) {
      return packages;
    }

    String[] components = rawValue.split(":");
    for (String entry : components) {
      if (entry == null || entry.trim().isEmpty()) continue;
      String value = entry.trim();
      int slashIndex = value.indexOf('/');
      String packageName = slashIndex > 0 ? value.substring(0, slashIndex) : value;
      if (!packageName.trim().isEmpty()) {
        packages.add(packageName.trim());
      }
    }
    return packages;
  }

  private boolean isPlayProtectEnabled(Context context) {
    try {
      int verifierEnabled = Settings.Global.getInt(
        context.getContentResolver(),
        "package_verifier_enable",
        1
      );
      return verifierEnabled == 1;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isUnknownSourcesEnabled(Context context) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        return context.getPackageManager().canRequestPackageInstalls();
      }
      //noinspection deprecation
      return Settings.Secure.getInt(context.getContentResolver(), Settings.Secure.INSTALL_NON_MARKET_APPS, 0) == 1;
    } catch (Exception ignored) {
      return false;
    }
  }

  private boolean isActiveWifi(Context context) {
    try {
      ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (connectivityManager == null) return false;
      Network activeNetwork = connectivityManager.getActiveNetwork();
      if (activeNetwork == null) return false;
      NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
      if (capabilities == null) return false;
      return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    } catch (Exception ignored) {
      return false;
    }
  }

  @NonNull
  private String mapBiometricAvailabilityStatus(int statusCode) {
    if (statusCode == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
      return "none_enrolled";
    }
    if (statusCode == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
      return "hardware_unavailable";
    }
    if (statusCode == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
      return "unsupported";
    }
    if (statusCode == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED) {
      return "unsupported";
    }
    return "unsupported";
  }

  @NonNull
  private String mapBiometricErrorStatus(int errorCode) {
    if (
      errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
      errorCode == BiometricPrompt.ERROR_CANCELED
    ) {
      return "user_cancel";
    }
    if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
      return "negative_button";
    }
    if (errorCode == BiometricPrompt.ERROR_TIMEOUT) {
      return "timeout";
    }
    if (errorCode == BiometricPrompt.ERROR_LOCKOUT) {
      return "lockout";
    }
    if (errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
      return "lockout_permanent";
    }
    if (errorCode == BiometricPrompt.ERROR_HW_UNAVAILABLE) {
      return "hardware_unavailable";
    }
    if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS) {
      return "none_enrolled";
    }
    return "error";
  }

  private boolean isDebuggable(Context context) {
    return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }

  private String mapContactLabel(int androidType) {
    if (
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_WORK ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_WORK_MOBILE ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_WORK_PAGER ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_COMPANY_MAIN
    ) {
      return "work";
    }

    if (
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_HOME ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_FAX_HOME
    ) {
      return "family";
    }

    if (
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_OTHER ||
      androidType == ContactsContract.CommonDataKinds.Phone.TYPE_MAIN
    ) {
      return "service";
    }

    return "unknown";
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

  @Override
  protected void handleOnDestroy() {
    unregisterApkDownloadReceiver();
    super.handleOnDestroy();
  }
}
