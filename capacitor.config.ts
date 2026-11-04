import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rvappstudios.lucasballoonride',
  appName: "Lucas' Balloon Ride",
  webDir: 'dist',
  android: {
    // No mixed content, no remote debugging in release builds.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
