import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppV3';
import './styles.css';
import './v2.css';
import './enhancements.css';
import './v3.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);

const APP_VERSION = 'v32-force-refresh';
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
