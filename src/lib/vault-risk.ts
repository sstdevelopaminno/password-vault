export type VaultRiskSeverity = "low" | "medium" | "high" | "critical";

export type VaultRiskAction =
  | "notify_user"
  | "limit_sensitive_actions"
  | "force_reauth"
  | "suggest_uninstall_risky_apps"
  | "block_sync"
  | "block_sensitive_data"
  | "lock_vault_temporarily";

export type VaultRiskFactorType = "device" | "app" | "network" | "link" | "integrity";

export type VaultRiskFactor = {
  code: string;
  type: VaultRiskFactorType;
  score: number;
  message: string;
  evidence?: Record<string, unknown>;
};

export type VaultRiskSnapshot = {
  source?: "android-apk" | "android-pwa" | "ios-native" | "ios-pwa" | "browser" | "server";
  collectedAt?: string;
  device?: {
    apiLevel?: number;
    isEmulator?: boolean;
    isDebuggable?: boolean;
    hasTestKeys?: boolean;
    suBinaryDetected?: boolean;
    developerOptionsEnabled?: boolean;
    adbEnabled?: boolean;
    playIntegrityVerdict?: "strong" | "device" | "basic" | "failed" | "unknown";
  };
  app?: {
    suspiciousApps?: string[];
    suspiciousAppCount?: number;
    riskyInstallerApps?: string[];
    heuristicRiskyApps?: string[];
    highRiskPackageKeywordApps?: string[];
    adwareLikeApps?: string[];
    gameLikeApps?: string[];
    unknownInstallerCount?: number;
    heuristicRiskyAppCount?: number;
    adwareLikeCount?: number;
    gameLikeCount?: number;
    packageVisibilityLimited?: boolean;
    queryAllPackagesDeclared?: boolean;
    installSource?: string;
    expectedInstallSource?: string;
  };
  network?: {
    vpnActive?: boolean;
    insecureTransport?: boolean;
    proxyDetected?: boolean;
    knownMaliciousDomainHit?: boolean;
  };
  links?: {
    phishingDomainMatched?: boolean;
    dangerousDeepLinkMatched?: boolean;
  };
  meta?: {
    runtimeMode?: string;
    appVersion?: string;
    trigger?: string;
  };
};

export type VaultRiskAssessment = {
  assessedAt: string;
  score: number;
  severity: VaultRiskSeverity;
  factors: VaultRiskFactor[];
  actions: VaultRiskAction[];
  policyTtlSec: number;
  lockDurationSec: number;
  nextAssessmentInSec: number;
  confidenceWarnings: string[];
};

const SCORE_THRESHOLD = {
  medium: 30,
  high: 55,
  critical: 80,
} as const;

function addFactor(
  factors: VaultRiskFactor[],
  score: number,
  type: VaultRiskFactorType,
  code: string,
  message: string,
  evidence?: Record<string, unknown>,
) {
  factors.push({
    code,
    type,
    score,
    message,
    evidence,
  });
}

function toSeverity(score: number): VaultRiskSeverity {
  if (score >= SCORE_THRESHOLD.critical) return "critical";
  if (score >= SCORE_THRESHOLD.high) return "high";
  if (score >= SCORE_THRESHOLD.medium) return "medium";
  return "low";
}

function toActions(severity: VaultRiskSeverity, suspiciousAppCount: number): VaultRiskAction[] {
  if (severity === "low") {
    return suspiciousAppCount > 0 ? ["notify_user", "suggest_uninstall_risky_apps"] : [];
  }

  if (severity === "medium") {
    const actions: VaultRiskAction[] = ["notify_user", "limit_sensitive_actions"];
    if (suspiciousAppCount > 0) {
      actions.push("suggest_uninstall_risky_apps");
    }
    return actions;
  }

  if (severity === "high") {
    const actions: VaultRiskAction[] = [
      "notify_user",
      "limit_sensitive_actions",
      "block_sensitive_data",
      "block_sync",
    ];
    if (suspiciousAppCount > 0) {
      actions.push("suggest_uninstall_risky_apps");
    }
    return actions;
  }

  const criticalActions: VaultRiskAction[] = [
    "notify_user",
    "force_reauth",
    "limit_sensitive_actions",
    "block_sensitive_data",
    "block_sync",
    "lock_vault_temporarily",
  ];
  if (suspiciousAppCount > 0) {
    criticalActions.push("suggest_uninstall_risky_apps");
  }
  return criticalActions;
}

function toPolicyTtlSec(severity: VaultRiskSeverity) {
  if (severity === "critical") return 30 * 60;
  if (severity === "high") return 20 * 60;
  if (severity === "medium") return 10 * 60;
  return 5 * 60;
}

function toLockDurationSec(severity: VaultRiskSeverity) {
  if (severity === "critical") return 20 * 60;
  if (severity === "high") return 5 * 60;
  return 0;
}

function toNextAssessmentInSec(severity: VaultRiskSeverity) {
  if (severity === "critical") return 60;
  if (severity === "high") return 3 * 60;
  if (severity === "medium") return 5 * 60;
  return 15 * 60;
}

export function evaluateVaultRisk(snapshot: VaultRiskSnapshot): VaultRiskAssessment {
  const factors: VaultRiskFactor[] = [];
  const confidenceWarnings: string[] = [];

  const suspiciousApps = Array.isArray(snapshot.app?.suspiciousApps)
    ? snapshot.app?.suspiciousApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const suspiciousCount = Math.max(
    suspiciousApps.length,
    Number.isFinite(snapshot.app?.suspiciousAppCount) ? Number(snapshot.app?.suspiciousAppCount ?? 0) : 0,
  );
  const riskyInstallerApps = Array.isArray(snapshot.app?.riskyInstallerApps)
    ? snapshot.app?.riskyInstallerApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const heuristicRiskyApps = Array.isArray(snapshot.app?.heuristicRiskyApps)
    ? snapshot.app?.heuristicRiskyApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const highRiskKeywordApps = Array.isArray(snapshot.app?.highRiskPackageKeywordApps)
    ? snapshot.app?.highRiskPackageKeywordApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const adwareLikeApps = Array.isArray(snapshot.app?.adwareLikeApps)
    ? snapshot.app?.adwareLikeApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];
  const gameLikeApps = Array.isArray(snapshot.app?.gameLikeApps)
    ? snapshot.app?.gameLikeApps.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];

  const unknownInstallerCount = Math.max(
    riskyInstallerApps.length,
    Number.isFinite(snapshot.app?.unknownInstallerCount) ? Number(snapshot.app?.unknownInstallerCount ?? 0) : 0,
  );
  const heuristicRiskyAppCount = Math.max(
    heuristicRiskyApps.length,
    Number.isFinite(snapshot.app?.heuristicRiskyAppCount) ? Number(snapshot.app?.heuristicRiskyAppCount ?? 0) : 0,
  );
  const adwareLikeCount = Math.max(
    adwareLikeApps.length,
    Number.isFinite(snapshot.app?.adwareLikeCount) ? Number(snapshot.app?.adwareLikeCount ?? 0) : 0,
  );
  const gameLikeCount = Math.max(
    gameLikeApps.length,
    Number.isFinite(snapshot.app?.gameLikeCount) ? Number(snapshot.app?.gameLikeCount ?? 0) : 0,
  );

  const verdict = snapshot.device?.playIntegrityVerdict ?? "unknown";
  if (verdict === "failed") {
    addFactor(factors, 38, "integrity", "play_integrity_failed", "Play Integrity check failed");
  } else if (verdict === "basic") {
    addFactor(factors, 22, "integrity", "play_integrity_basic_only", "Only basic integrity is available");
  } else if (verdict === "device") {
    addFactor(factors, 8, "integrity", "play_integrity_device_only", "Strong integrity not available");
  } else if (verdict === "unknown") {
    confidenceWarnings.push("play_integrity_missing");
  }

  if (snapshot.device?.suBinaryDetected) {
    addFactor(factors, 42, "device", "root_su_binary_detected", "Possible rooted device (su binary detected)");
  }

  if (snapshot.device?.hasTestKeys) {
    addFactor(factors, 24, "device", "test_keys_detected", "Build tags contain test-keys");
  }

  if (snapshot.device?.isEmulator) {
    addFactor(factors, 16, "device", "emulator_detected", "Runtime appears to be an emulator");
  }

  if (snapshot.device?.isDebuggable) {
    addFactor(factors, 12, "device", "debuggable_build", "App process is running in debuggable mode");
  }

  if (snapshot.device?.developerOptionsEnabled) {
    addFactor(factors, 8, "device", "developer_options_enabled", "Developer options are enabled");
  }

  if (snapshot.device?.adbEnabled) {
    addFactor(factors, 12, "device", "adb_enabled", "ADB is enabled on this device");
  }

  if (suspiciousCount > 0) {
    addFactor(
      factors,
      Math.min(48, suspiciousCount * 16),
      "app",
      "suspicious_apps_detected",
      "Potentially risky apps detected on device",
      {
        suspiciousCount,
        suspiciousApps,
      },
    );
  }

  if (heuristicRiskyAppCount > 0) {
    addFactor(
      factors,
      Math.min(44, heuristicRiskyAppCount * 12),
      "app",
      "heuristic_risky_apps_detected",
      "Apps matched malware/hack/mod keyword heuristics",
      {
        heuristicRiskyAppCount,
        heuristicRiskyApps,
        highRiskKeywordApps,
      },
    );
  }

  if (unknownInstallerCount > 0) {
    addFactor(
      factors,
      Math.min(22, unknownInstallerCount * 4),
      "app",
      "unknown_installer_apps_detected",
      "Installed apps from unknown/non-trusted installer sources",
      {
        unknownInstallerCount,
        riskyInstallerApps: riskyInstallerApps.slice(0, 40),
      },
    );
  }

  if (adwareLikeCount > 0) {
    addFactor(
      factors,
      Math.min(28, adwareLikeCount * 7),
      "app",
      "adware_like_apps_detected",
      "Potential adware/overlay ad app patterns detected",
      {
        adwareLikeCount,
        adwareLikeApps,
      },
    );
  }

  if (gameLikeCount >= 15) {
    addFactor(
      factors,
      8,
      "app",
      "high_game_app_density",
      "High count of game-like apps may increase ad/malware exposure risk",
      {
        gameLikeCount,
      },
    );
  }

  if (snapshot.network?.proxyDetected) {
    addFactor(factors, 12, "network", "proxy_detected", "Network proxy is detected");
  }

  if (snapshot.network?.vpnActive) {
    addFactor(factors, 6, "network", "vpn_active", "VPN connection is active");
  }

  if (snapshot.network?.insecureTransport) {
    addFactor(factors, 14, "network", "insecure_transport", "Insecure transport was detected");
  }

  if (snapshot.network?.knownMaliciousDomainHit) {
    addFactor(factors, 36, "network", "malicious_domain_detected", "Known malicious domain was contacted");
  }

  if (snapshot.links?.phishingDomainMatched) {
    addFactor(factors, 34, "link", "phishing_domain_matched", "Phishing domain match detected");
  }

  if (snapshot.links?.dangerousDeepLinkMatched) {
    addFactor(factors, 22, "link", "dangerous_deeplink_matched", "Dangerous deep link pattern matched");
  }

  if (snapshot.app?.packageVisibilityLimited) {
    confidenceWarnings.push("package_visibility_limited_android11_plus");
  }

  if (snapshot.app?.queryAllPackagesDeclared === false) {
    confidenceWarnings.push("query_all_packages_not_declared");
  }

  if (
    snapshot.app?.expectedInstallSource &&
    snapshot.app?.installSource &&
    snapshot.app.expectedInstallSource !== snapshot.app.installSource
  ) {
    addFactor(factors, 10, "app", "unexpected_install_source", "App install source does not match expected source", {
      expectedInstallSource: snapshot.app.expectedInstallSource,
      installSource: snapshot.app.installSource,
    });
  }

  const score = factors.reduce((sum, factor) => sum + factor.score, 0);
  const severity = toSeverity(score);
  const actions = toActions(severity, suspiciousCount);

  return {
    assessedAt: new Date().toISOString(),
    score,
    severity,
    factors,
    actions,
    policyTtlSec: toPolicyTtlSec(severity),
    lockDurationSec: toLockDurationSec(severity),
    nextAssessmentInSec: toNextAssessmentInSec(severity),
    confidenceWarnings,
  };
}
