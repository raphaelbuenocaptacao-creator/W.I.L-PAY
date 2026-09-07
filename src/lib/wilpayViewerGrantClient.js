const HTTPS_PROTOCOL = 'https:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function parseViewerGrantEndpoint(value) {
  let url;
  try {
    url = new URL(requiredText(value, 'W.I.L Pay viewer grant endpoint'));
  } catch {
    throw new Error('Invalid W.I.L Pay viewer grant endpoint');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('Invalid W.I.L Pay viewer grant endpoint');
  }
  if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('W.I.L Pay viewer grant endpoint must use HTTPS');
  }
  return url;
}

export function configuredWilpayViewerGrantEndpoint() {
  return String(import.meta.env?.VITE_WILPAY_VIEWER_GRANT_ENDPOINT || '').trim() || null;
}

export function isWilpayPrivateViewerConfigured() {
  const endpoint = configuredWilpayViewerGrantEndpoint();
  if (!endpoint) return false;
  parseViewerGrantEndpoint(endpoint);
  return true;
}

export function createWilpayViewerGrantRequester({
  endpoint = configuredWilpayViewerGrantEndpoint(),
  getAccessToken,
  fetchImpl = fetch
} = {}) {
  const url = parseViewerGrantEndpoint(endpoint);
  if (typeof getAccessToken !== 'function') throw new Error('getAccessToken is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');

  return async function requestWilpayViewerGrant(metadata) {
    if (!metadata || typeof metadata !== 'object') throw new Error('Viewer grant metadata is required');
    const fileId = requiredText(metadata.file_id, 'file_id');
    const objectKey = requiredText(metadata.object_key, 'object_key');
    const accessToken = requiredText(await getAccessToken(), 'W.I.L Pay access token');

    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ file_id: fileId, object_key: objectKey }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });

    if (!response?.ok) throw new Error(`Viewer grant request failed (${response?.status ?? 'unknown'})`);
    const grant = await response.json();
    if (!grant || typeof grant !== 'object') throw new Error('Viewer grant response is invalid');
    return grant;
  };
}
