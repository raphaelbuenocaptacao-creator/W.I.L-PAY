import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppV4';
import { neon } from './lib/aureonClient';
import { installWilpayLegacyAttachmentWriteGuard } from './lib/wilpayLegacyAttachmentWriteGuard.js';
import './realtimeAutoRefresh.js';
import './styles.css';
import './v2.css';
import './enhancements.css';
import './v3.css';
import './documentViewerFix.css';
import './documentViewerFix.js';

installWilpayLegacyAttachmentWriteGuard(neon);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);

const APP_VERSION = 'v38-private-vary-range-safe';
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.dispatchEvent(new CustomEvent('wilpay:pwa-install-available'));
});

window.installWilPay = async () => {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return choice.outcome === 'accepted';
};

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  window.dispatchEvent(new CustomEvent('wilpay:pwa-installed'));
});

const isSecureContextForPwa = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && isSecureContextForPwa) {
  window.addEventListener('load', async () => {
    try {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'WILPAY_UPDATE_READY' && !reloading) {
          reloading = true;
          location.reload();
        }
      });
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${APP_VERSION}`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none'
      });
      await registration.update();
    } catch (error) {
      console.warn('W.I.L Pay service worker registration failed.', error);
    }
  });
}
