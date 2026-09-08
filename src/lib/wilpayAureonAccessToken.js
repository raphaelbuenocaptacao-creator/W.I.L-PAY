import { neon } from './aureonClient.js';

const ACCESS_STORAGE_KEY = 'wilpay_aureon_access';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
  return value;
}

export async function getWilpayAureonAccessToken({
  auth = neon.auth,
  storage = globalThis.localStorage
} = {}) {
  const getSession = requiredFunction(auth?.getSession, 'auth.getSession');
  const session = await getSession();
  if (session?.error || !session?.data?.user?.id) {
    throw new Error('W.I.L Pay authenticated session is required');
  }

  if (!storage || typeof storage.getItem !== 'function') {
    throw new Error('secure session storage is unavailable');
  }

  const token = String(storage.getItem(ACCESS_STORAGE_KEY) || '').trim();
  if (!token) throw new Error('W.I.L Pay access token is unavailable');

  return token;
}
