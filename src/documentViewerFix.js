import { isWilpayViewerSource, mimeFromViewerSource } from './lib/wilpayViewerSource.js';

function fileNameFromAnchor(anchor) {
  const card = anchor.closest('.doc-card');
  const cardName = card?.querySelector('small')?.textContent?.trim();
  if (cardName) return cardName;
  const released = anchor.closest('.released');
  if (released) return 'Comprovante da liberação';
  return 'Documento W.I.L Pay';
}

function closeViewer(overlay) {
  if (!overlay) return;
  document.body.classList.remove('wil-viewer-open');
  overlay.remove();
}

function openViewer(source, title, declaredMime = '') {
  const existing = document.querySelector('.wil-document-viewer');
  if (existing) closeViewer(existing);

  const mime = mimeFromViewerSource(source, declaredMime);
  const overlay = document.createElement('div');
  overlay.className = 'wil-document-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title || 'Visualizar documento');

  const shell = document.createElement('div');
  shell.className = 'wil-document-viewer__shell';
  const header = document.createElement('div');
  header.className = 'wil-document-viewer__header';
  const heading = document.createElement('div');
  heading.className = 'wil-document-viewer__title';
  heading.innerHTML = `<small>VISUALIZAÇÃO SEGURA</small><b></b>`;
  heading.querySelector('b').textContent = title || 'Documento';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'wil-document-viewer__close';
  close.textContent = 'Fechar ×';
  close.addEventListener('click', () => closeViewer(overlay));
  header.append(heading, close);

  const body = document.createElement('div');
  body.className = 'wil-document-viewer__body';
  if (mime.startsWith('image/')) {
    const image = document.createElement('img');
    image.src = source;
    image.alt = title || 'Documento';
    image.referrerPolicy = 'no-referrer';
    image.className = 'wil-document-viewer__image';
    body.appendChild(image);
  } else if (mime === 'application/pdf') {
    const frame = document.createElement('iframe');
    frame.src = source;
    frame.title = title || 'Documento PDF';
    frame.referrerPolicy = 'no-referrer';
    frame.className = 'wil-document-viewer__pdf';
    body.appendChild(frame);
  } else {
    const message = document.createElement('div');
    message.className = 'wil-document-viewer__unsupported';
    message.textContent = 'Não foi possível visualizar este formato dentro do aplicativo.';
    body.appendChild(message);
  }

  const footer = document.createElement('div');
  footer.className = 'wil-document-viewer__footer';
  const download = document.createElement('a');
  download.href = source;
  download.download = title || 'documento';
  download.rel = 'noreferrer';
  download.referrerPolicy = 'no-referrer';
  download.textContent = 'Salvar arquivo';
  download.className = 'wil-document-viewer__download';
  footer.appendChild(download);

  shell.append(header, body, footer);
  overlay.appendChild(shell);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeViewer(overlay);
  });
  document.body.appendChild(overlay);
  document.body.classList.add('wil-viewer-open');
  close.focus();
}

function viewerAnchorFromEvent(event) {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return null;
  const source = anchor.getAttribute('href');
  const privateFile = anchor.dataset.wilPrivateFile === '1';
  return isWilpayViewerSource(source, { privateFile }) ? anchor : null;
}

function interceptViewerLinks(event) {
  const anchor = viewerAnchorFromEvent(event);
  if (!anchor) return;
  event.preventDefault();
  event.stopPropagation();
  openViewer(anchor.getAttribute('href'), fileNameFromAnchor(anchor), anchor.dataset.mimeType || '');
}

function improveLinkLabels(root = document) {
  root.querySelectorAll?.('a[href^="data:"], a[data-wil-private-file="1"][href]').forEach(anchor => {
    if (!isWilpayViewerSource(anchor.getAttribute('href'), { privateFile: anchor.dataset.wilPrivateFile === '1' })) return;
    if (anchor.dataset.wilViewerReady) return;
    anchor.dataset.wilViewerReady = '1';
    if (anchor.closest('.released')) anchor.textContent = 'Visualizar comprovante';
    else anchor.textContent = 'Visualizar documento';
    anchor.removeAttribute('target');
  });
}

document.addEventListener('click', interceptViewerLinks, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeViewer(document.querySelector('.wil-document-viewer'));
});
const observer = new MutationObserver(() => improveLinkLabels(document));
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => improveLinkLabels(document));
else improveLinkLabels(document);
