// Capacitor-only glue: Preferences-backed storage adapter and the hardware back button.
// (The mic runtime permission: Capacitor's WebChromeClient requests RECORD_AUDIO when the
// WebView asks for audio capture, before getUserMedia resolves. See README › Android.)
import type { App } from './App';
import { createPrefsBackend, type StorageBackend } from './storage/Storage';
import { STORAGE } from './config';

export function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export async function nativeBackend(): Promise<StorageBackend> {
  const { Preferences } = await import('@capacitor/preferences');
  return createPrefsBackend(Preferences, [STORAGE.key]);
}

interface MicPermissionPlugin {
  request(): Promise<{ granted: boolean }>;
}

export async function setupNative(app: App): Promise<void> {
  const [{ App: CapApp }, { registerPlugin }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/core'),
  ]);
  const micPermission = registerPlugin<MicPermissionPlugin>('MicPermission');
  app.beforeMic = async () => {
    try {
      return (await micPermission.request()).granted;
    } catch {
      return true; // Plugin missing (older shell): let getUserMedia ask.
    }
  };
  // QR links scanned while the app is installed arrive as App Links.
  await CapApp.addListener('appUrlOpen', (e) => {
    try {
      app.handleUnlockUrl(new URL(e.url).search);
    } catch {
      // Not a URL we understand.
    }
  });
  const launch = await CapApp.getLaunchUrl();
  if (launch?.url) {
    try {
      app.handleUnlockUrl(new URL(launch.url).search);
    } catch {
      // ignore
    }
  }
  await CapApp.addListener('backButton', () => {
    const top = app.router.top;
    if (top?.id === 'menu' || top?.id === 'splash') {
      void CapApp.exitApp();
      return;
    }
    // In-app back: gameplay pauses first, never closes mid-level.
    app.handleBack();
  });
}
