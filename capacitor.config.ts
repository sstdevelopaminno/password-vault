import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;
const allowNavigationCsv = process.env.CAPACITOR_ALLOW_NAVIGATION ?? '';

function parseAllowNavigation(input: string) {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const allowNavigation = parseAllowNavigation(allowNavigationCsv);

const config: CapacitorConfig = {
  appId: 'com.passwordvault.app',
  appName: 'Password Vault',
  // webDir is required by Capacitor even when pilot mode points to a remote server URL.
  webDir: 'www',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        allowNavigation: allowNavigation.length ? allowNavigation : undefined,
      }
    : undefined,
};

export default config;
