const HTTPS_PROTOCOL = 'https:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function parseGrantEndpoint(value) {
  let url;
  try {
    url = new URL(requiredText(value, 'W.I.L Pay upload grant endpoint'));
  } catch {
    throw new Error('Invalid W.I.L Pay upload grant endpoint');
  }
  if (url.username || url.password || url.hash) throw new Error('Invalid W.I.L Pay upload grant endpoint');
  if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('W.I.L Pay upload grant endpoint must use HTTPS');
  }
  return url;
}

export function configuredWilpayUploadGrantEndpoint() {
  return String(import.meta.env?.VITE_WILPAY_UPLOAD_GRANT_ENDPOINT || '').trim() || null;
}

export function isWilpayPrivateUploadConfigured() {
  const endpoint = configuredWilpayUploadGrantEndpoint();
  if (!endpoint) return false;
  parseGrantEndpoint(endpoint);
  return true;
}

export function createWilpayUploadGrantRequester({
  endpoint = configuredWilpayUploadGrantEndpoint(),
  getAccessToken,
  fetchImpl = fetch
} = {}) {
  const url = parseGrantEndpoint(endpoint);
  if (typeof getAccessToken !== 'function') throw new Error('getAccessToken is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');

  return async function requestWilpayUploadGrant(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Upload grant payload is required');
    const accessToken = requiredText(await getAccessToken(), 'W.I.L Pay access token');
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });

    if (!response?.ok) throw new Error(`Upload grant request failed (${response?.status ?? 'unknown'})`);
    const grant = await response.json();
    if (!grant || typeof grant !== 'object') throw new Error('Upload grant response is invalid');
    return grant;
  };
}
