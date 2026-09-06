const ALLOWED_VIEWER_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function normalizeMime(value) {
  return String(value || '').trim().toLowerCase();
}

export function mimeFromViewerSource(source, declaredMime = '') {
  const explicit = normalizeMime(declaredMime);
  if (ALLOWED_VIEWER_MIME_TYPES.has(explicit)) return explicit;

  const raw = String(source || '').trim();
  const dataMatch = raw.match(/^data:([^;,]+)/i);
  if (dataMatch) {
    const mime = normalizeMime(dataMatch[1]);
    return ALLOWED_VIEWER_MIME_TYPES.has(mime) ? mime : '';
  }

  try {
    const url = new URL(raw, 'https://wilpay.invalid');
    const path = url.pathname.toLowerCase();
    if (path.endsWith('.pdf')) return 'application/pdf';
    if (/\.(jpe?g)$/.test(path)) return 'image/jpeg';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
  } catch {
    return '';
  }

  return '';
}

export function isWilpayViewerSource(source, { privateFile = false } = {}) {
  const raw = String(source || '').trim();
  if (!raw) return false;
  if (raw.startsWith('data:')) return Boolean(mimeFromViewerSource(raw));
  if (!privateFile) return false;
  try {
    const url = new URL(raw, 'https://wilpay.invalid');
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

export const WILPAY_VIEWER_MIME_TYPES = Object.freeze([...ALLOWED_VIEWER_MIME_TYPES]);
