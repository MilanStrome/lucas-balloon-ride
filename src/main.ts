// Boot: styles, app, service worker registration, Capacitor glue, e2e hooks.
import './styles.css';
import { App } from './App';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const native = await import('./native');
  const app = new App(root, native.isNative() ? await native.nativeBackend() : undefined);
  if (import.meta.env.MODE === 'e2e') {
    const { installTestHooks } = await import('./testHooks');
    installTestHooks(app);
  }
  await app.boot();

  // Capacitor (Android): hardware back = in-app back; never closes mid-level without pausing.
  if (native.isNative()) await native.setupNative(app);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = async () => {
      const { registerSW } = await import('virtual:pwa-register');
      const update = registerSW({
        onNeedRefresh() {
          // Shown in the main menu only, never during gameplay.
          app.updateReady = () => void update(true);
        },
      });
    };
    // After load, so caching never competes with the first paint.
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }
}

void boot();
