import { createClient } from '@neondatabase/neon-js';

const AUTH_ENV = 'VITE_WILPAY_NEON_AUTH_URL';
const DATA_API_ENV = 'VITE_WILPAY_NEON_DATA_API_URL';

function requireWilpayEndpoint(name) {
  const value = String(import.meta.env?.[name] || '').trim();
  if (!value) {
    throw new Error(`W.I.L Pay infrastructure is not configured: ${name} is required.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`W.I.L Pay infrastructure is not configured: ${name} must be a valid URL.`);
  }

  const isNeon = url.protocol === 'https:' && url.hostname.endsWith('.neon.tech');
  const isStorageRegion = url.hostname.includes('.us-east-2.');
  if (!isNeon || !isStorageRegion) {
    throw new Error(
      `W.I.L Pay infrastructure isolation rejected ${name}: use the dedicated Neon project in us-east-2.`,
    );
  }

  return url.toString().replace(/\/$/, '');
}

const authUrl = requireWilpayEndpoint(AUTH_ENV);
const dataApiUrl = requireWilpayEndpoint(DATA_API_ENV);

export const neon = createClient({
  auth: { url: authUrl },
  dataApi: { url: dataApiUrl },
});
