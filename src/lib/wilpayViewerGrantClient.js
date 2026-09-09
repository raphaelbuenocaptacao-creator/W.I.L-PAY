const HTTPS_PROTOCOL = 'https:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const PRODUCTION_PREFIX = 'wilpay/production/';
const LEGACY_PREFIX = 'wilpay/users/';
const PRODUCTION_CATEGORIES = new Set(['documents', 'selfies', 'receipts', 'guarantees', 'history']);

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeSegment(value, label) {
  const text = requiredText(value, label);
  if (text.length > 128 || !/^[A-Za-z0-9_-]+$/.test(text) || text === '.' || text === '..') {
    throw new Error(`Invalid ${label}`);
  }
  return text;
}

function assertViewerObjectScope({ fileId, objectKey, ownerUserId }) {
  if (objectKey.includes('\\') || objectKey.includes('//') || objectKey.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Viewer object_key is outside W.I.L Pay private scope');
  }

  if (objectKey.startsWith(PRODUCTION_PREFIX)) {
    const parts = objectKey.split('/');
    if (parts.length !== 5 || parts[0] !== 'wilpay' || parts[1] !== 'production') {
      throw new Error('Viewer object_key is outside W.I.L Pay private scope');
    }
    const objectOwner = safeSegment(parts[2], 'viewer owner');
    if (objectOwner !== ownerUserId) throw new Error('Viewer object_key owner does not match attachment owner');
    if (!PRODUCTION_CATEGORIES.has(parts[3])) throw new Error('Viewer object_key category is invalid');
    if (safeSegment(parts[4], 'viewer file_id') !== fileId) {
      throw new Error('Viewer object_key does not match file_id');
    }
    return true;
  }

  if (objectKey.startsWith(LEGACY_PREFIX)) {
    const parts = objectKey.split('/');
    if (parts.length !== 7 || parts[0] !== 'wilpay' || parts[1] !== 'users' || parts[3] !== 'loans') {
      throw new Error('Viewer legacy object_key is outside W.I.L Pay private scope');
    }
    const objectOwner = safeSegment(parts[2], 'viewer legacy owner');
    if (objectOwner !== ownerUserId) throw new Error('Viewer legacy object_key owner does not match attachment owner');
    safeSegment(parts[4], 'viewer legacy loan');
    safeSegment(parts[5], 'viewer legacy kind');
    const filename = requiredText(parts[6], 'viewer legacy filename');
    const stem = filename.replace(/\.[A-Za-z0-9]+$/, '');
    if (stem !== fileId) throw new Error('Viewer legacy object_key does not match file_id');
    return true;
  }

  throw new Error('Viewer object_key is outside W.I.L Pay private scope');
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

function assertReturnedGrantScope(grant, { fileId, objectKey, ownerUserId }) {
  if (grant.file_id != null && requiredText(grant.file_id, 'Viewer grant file_id') !== fileId) {
    throw new Error('Viewer grant file_id does not match request');
  }
  if (grant.object_key != null && requiredText(grant.object_key, 'Viewer grant object_key') !== objectKey) {
    throw new Error('Viewer grant object_key does not match request');
  }
  if (grant.owner_user_id != null && safeSegment(grant.owner_user_id, 'Viewer grant owner_user_id') !== ownerUserId) {
    throw new Error('Viewer grant owner_user_id does not match request');
  }
  if (grant.auth_uid != null && safeSegment(grant.auth_uid, 'Viewer grant auth_uid') !== ownerUserId) {
    throw new Error('Viewer grant auth_uid does not match request');
  }
  return grant;
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
    const fileId = safeSegment(metadata.file_id, 'file_id');
    const ownerUserId = safeSegment(metadata.owner_user_id || metadata.auth_uid, 'owner_user_id');
    const objectKey = requiredText(metadata.object_key, 'object_key');
    assertViewerObjectScope({ fileId, objectKey, ownerUserId });
    const accessToken = requiredText(await getAccessToken(), 'W.I.L Pay access token');

    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ file_id: fileId, object_key: objectKey, owner_user_id: ownerUserId }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });

    if (!response?.ok) throw new Error(`Viewer grant request failed (${response?.status ?? 'unknown'})`);
    const grant = await response.json();
    if (!grant || typeof grant !== 'object') throw new Error('Viewer grant response is invalid');
    return assertReturnedGrantScope(grant, { fileId, objectKey, ownerUserId });
  };
}
