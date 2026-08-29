import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppV2';
import './styles.css';
import './v2.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);

const isSecureContextForPwa = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && isSecureContextForPwa) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none'
      });
      await registration.update();
    } catch (error) {
      console.warn('W.I.L Pay service worker registration failed.', error);
    }
  });
}
