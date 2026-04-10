import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.passwordvault.app',
  appName: 'Password Vault',
  // webDir is required by Capacitor even when pilot mode points to a remote server URL.
  webDir: 'www',
  server: serverUrl ? { url: serverUrl, cleartext: serverUrl.startsWith('http://') } : undefined,
};

export default config;
