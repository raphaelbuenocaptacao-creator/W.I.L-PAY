import { neon } from './lib/aureonClient.js';
import { resolveWilpayAttachmentForCurrentSession } from './lib/wilpayAttachmentViewerSession.js';
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

async function resolveCurrentPayoutReceipt() {
  const session = await neon.auth.getSession();
  const user = session?.data?.user;
  if (!user?.id) throw new Error('Sessão expirada. Entre novamente para visualizar o comprovante.');

  const result = await neon.from('wilpay_loans')
    .select('*')
    .eq('auth_uid', user.id)
    .order('created_at', { ascending: false });
  if (result.error) throw new Error('Não foi possível localizar o comprovante.');

  const rows = result.data || [];
  const loans = rows
    .filter(row => !row.record_type || row.record_type === 'LOAN')
    .sort((a, b) => new Date(b.requested_at || b.created_at) - new Date(a.requested_at || a.created_at));
  const current = loans[0];
  if (!current) throw new Error('Nenhuma solicitação ativa foi localizada.');

  const receipt = rows.find(row =>
    row.record_type === 'ATTACHMENT' &&
    String(row.loan_id) === String(current.id) &&
    row.doc_type === 'COMPROVANTE_PAGAMENTO'
  );
  if (!receipt) throw new Error('Comprovante da liberação ainda não disponível.');

  return resolveWilpayAttachmentForCurrentSession(receipt);
}

function viewerAnchorFromEvent(event) {
  const anchor = event.target.closest?.('a');
  if (!anchor) return null;
  if (anchor.dataset.wilPrivateReceipt === '1') return anchor;
  if (!anchor.hasAttribute('href')) return null;
  const source = anchor.getAttribute('href');
  const privateFile = anchor.dataset.wilPrivateFile === '1';
  return isWilpayViewerSource(source, { privateFile }) ? anchor : null;
}

async function interceptViewerLinks(event) {
  const anchor = viewerAnchorFromEvent(event);
  if (!anchor) return;
  event.preventDefault();
  event.stopPropagation();

  if (anchor.dataset.wilPrivateReceipt === '1') {
    if (anchor.dataset.wilBusy === '1') return;
    anchor.dataset.wilBusy = '1';
    anchor.setAttribute('aria-busy', 'true');
    const previousText = anchor.textContent;
    anchor.textContent = 'Abrindo...';
    try {
      const resolved = await resolveCurrentPayoutReceipt();
      openViewer(resolved.source, 'Comprovante da liberação', resolved.mime_type || '');
    } catch (error) {
      console.warn('W.I.L Pay private receipt viewer failed.', error);
      anchor.textContent = error?.message || 'Não foi possível abrir o comprovante.';
      setTimeout(() => { anchor.textContent = previousText; }, 3500);
    } finally {
      anchor.dataset.wilBusy = '0';
      anchor.setAttribute('aria-busy', 'false');
      if (anchor.textContent === 'Abrindo...') anchor.textContent = previousText;
    }
    return;
  }

  openViewer(anchor.getAttribute('href'), fileNameFromAnchor(anchor), anchor.dataset.mimeType || '');
}

function improveLinkLabels(root = document) {
  root.querySelectorAll?.('.released a:not([href])').forEach(anchor => {
    if (anchor.dataset.wilViewerReady) return;
    anchor.dataset.wilPrivateReceipt = '1';
    anchor.dataset.wilViewerReady = '1';
    anchor.href = '#';
    anchor.textContent = 'Visualizar comprovante';
    anchor.removeAttribute('target');
    anchor.setAttribute('aria-label', 'Visualizar comprovante da liberação');
  });

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
