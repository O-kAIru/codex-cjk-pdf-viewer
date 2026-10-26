import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/app';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import { decodeBase64, pdfResourceOptions } from './resources.mjs';

// The worker is bundled in this UI and runs via PDF.js's supported fake-worker path.
// No CDN, remote worker, CMap URL, PDF rewrite, or native application patch is used.
globalThis.pdfjsWorker = { WorkerMessageHandler };
const $ = id => document.getElementById(id);
const MAX_BYTES = 80 * 1024 * 1024;
let documentPdf = null;
let currentPage = 1;
let renderTask = null;
let generation = 0;
let renderGeneration = 0;
let textLayer = null;
let pageTexts = [];
let matchingPages = [];
let matchingIndex = -1;
let zoomMode = 'fit';
let lastInput = null;
let activeResourceUri = null;
let hostInputGeneration = 0;
let passwordCallback = null;
let loadTask = null;

const app = new App({ name: 'CJK PDF Viewer', version: '0.1.0' });
const openai = new OpenAIExtensions(app);

function status(message, state = 'ready') {
  $('status').textContent = message;
  document.body.dataset.state = state;
}
function updateControls() {
  $('page-number').value = String(currentPage);
  $('page-count').textContent = documentPdf ? `/ ${documentPdf.numPages}` : '/ 0';
  $('page-number').max = String(documentPdf?.numPages || 1);
  $('previous').disabled = !documentPdf || currentPage <= 1;
  $('next').disabled = !documentPdf || currentPage >= documentPdf.numPages;
  $('page-number').disabled = !documentPdf;
  $('zoom').disabled = !documentPdf;
  $('search').disabled = !documentPdf;
  $('find-next').disabled = !documentPdf;
}
function highlight() {
  const term = $('search').value.trim().normalize('NFKC').toLocaleLowerCase();
  for (const span of $('text-layer').querySelectorAll('span')) {
    span.classList.toggle('pdf-match', !!term && span.textContent.normalize('NFKC').toLocaleLowerCase().includes(term));
  }
}
async function renderPage() {
  if (!documentPdf) return;
  const token = ++renderGeneration;
  const doc = documentPdf;
  const pageNumber = currentPage;
  renderTask?.cancel();
  textLayer?.cancel();
  const page = await doc.getPage(pageNumber);
  if (token !== renderGeneration || doc !== documentPdf) return;
  const raw = page.getViewport({ scale: 1 });
  const width = Math.max(240, $('pages').clientWidth - 48);
  const scale = zoomMode === 'fit' ? Math.min(width / raw.width, 2.5) : Number(zoomMode) / 100;
  const viewport = page.getViewport({ scale });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = $('page-canvas');
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const paper = $('paper');
  paper.style.width = `${viewport.width}px`;
  paper.style.height = `${viewport.height}px`;
  paper.style.setProperty('--scale-factor', scale);
  paper.style.setProperty('--total-scale-factor', scale);
  $('empty').hidden = true;
  paper.hidden = false;
  $('text-layer').replaceChildren();
  updateControls();
  status('ページを表示しています…', 'loading');
  try {
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
    await renderTask.promise;
    if (token !== renderGeneration) return;
    const content = await page.getTextContent();
    pageTexts[pageNumber - 1] = content.items.filter(x => typeof x.str === 'string').map(x => x.str).join('');
    // Retain text selection, copy and search; the original PDF bytes remain unchanged.
    textLayer = new pdfjs.TextLayer({ textContentSource: content, container: $('text-layer'), viewport });
    await textLayer.render();
    if (token !== renderGeneration) return;
    highlight();
    $('paper').setAttribute('aria-label', `${$('file-name').textContent}、${pageNumber}ページ`);
    status('原本を変更せず表示しています');
    document.body.dataset.page = String(pageNumber);
    document.body.dataset.pageReady = 'true';
  } catch (error) {
    if (error?.name === 'RenderingCancelledException' || token !== renderGeneration) return;
    status(`表示できませんでした：${error.message || error}`, 'error');
  }
}
async function openBytes(input, name) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_BYTES) throw new Error('PDFの上限サイズは80MBです。');
  if (bytes.byteLength === 0) throw new Error('空のファイルです。');
  const token = ++generation;
  ++renderGeneration;
  renderTask?.cancel();
  textLayer?.cancel();
  const oldTask = loadTask;
  documentPdf = null;
  pageTexts = [];
  matchingPages = [];
  matchingIndex = -1;
  currentPage = 1;
  $('paper').hidden = true;
  $('empty').hidden = false;
  $('file-name').textContent = name || 'PDF';
  $('file-name').title = name || 'PDF';
  $('find-result').textContent = '';
  delete $('search').dataset.previousTerm;
  updateControls();
  status('PDFを読み込んでいます…', 'loading');
  if (oldTask) await oldTask.destroy();
  loadTask = pdfjs.getDocument({ data: bytes.slice(), ...pdfResourceOptions() });
  loadTask.onPassword = updatePassword => {
    passwordCallback = updatePassword;
    $('password-dialog').showModal();
    $('password').focus();
  };
  try {
    const doc = await loadTask.promise;
    if (token !== generation) { await doc.destroy(); return; }
    documentPdf = doc;
    await renderPage();
  } catch (error) {
    if (token === generation) status(`PDFを開けませんでした：${error.message || error}`, 'error');
  }
}
async function readHostInput(args) {
  const parsed = OpenAIFileEntrypointInputSchema.safeParse(args);
  if (!parsed.success) return;
  const inputToken = ++hostInputGeneration;
  lastInput = parsed.data;
  if (!openai.resources) { status('ファイルの受け取りを待っています…', 'loading'); return; }
  status('PDFを受け取っています…', 'loading');
  const uri = parsed.data.file.resourceUri;
  const result = await openai.resources.read({ uri, representation: 'blob' });
  if (inputToken !== hostInputGeneration) return;
  const content = result.contents.find(x => 'blob' in x && typeof x.blob === 'string');
  if (!content) throw new Error('PDFの内容を受け取れませんでした。');
  if (content.blob.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) throw new Error('PDFの上限サイズは80MBです。');
  await openBytes(decodeBase64(content.blob), parsed.data.file.name);
  if (inputToken !== hostInputGeneration) return;
  if (uri !== activeResourceUri) {
    if (activeResourceUri) await openai.resources.unsubscribe({ uri: activeResourceUri }).catch(() => {});
    activeResourceUri = uri;
    await openai.resources.subscribe({ uri }).catch(() => {});
  }
}
app.addEventListener('toolinput', async ({ arguments: args }) => {
  try { await readHostInput(args); } catch (error) { status(error.message || String(error), 'error'); }
});

$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  ++hostInputGeneration;
  lastInput = null;
  if (activeResourceUri) openai.resources?.unsubscribe({ uri: activeResourceUri }).catch(() => {});
  activeResourceUri = null;
  try { await openBytes(new Uint8Array(await file.arrayBuffer()), file.name); }
  catch (error) { status(error.message || String(error), 'error'); }
  event.target.value = '';
});
$('previous').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
$('next').addEventListener('click', () => { if (documentPdf && currentPage < documentPdf.numPages) { currentPage++; renderPage(); } });
$('page-number').addEventListener('change', () => {
  if (!documentPdf) return;
  currentPage = Math.max(1, Math.min(documentPdf.numPages, Number($('page-number').value) || 1));
  renderPage();
});
$('zoom').addEventListener('change', () => { zoomMode = $('zoom').value; renderPage(); });
$('password-form').addEventListener('submit', event => {
  event.preventDefault();
  const password = $('password').value;
  $('password').value = '';
  $('password-dialog').close();
  passwordCallback?.(password);
  passwordCallback = null;
});
async function findNext() {
  if (!documentPdf) return;
  const doc = documentPdf;
  const term = $('search').value.trim().normalize('NFKC').toLocaleLowerCase();
  if (!term) { $('find-result').textContent = ''; highlight(); return; }
  if ($('search').dataset.previousTerm !== term) {
    matchingPages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      if (doc !== documentPdf) return;
      if (pageTexts[p - 1] == null) {
        const text = await (await doc.getPage(p)).getTextContent();
        pageTexts[p - 1] = text.items.filter(x => typeof x.str === 'string').map(x => x.str).join('');
      }
      if (pageTexts[p - 1].normalize('NFKC').toLocaleLowerCase().includes(term)) matchingPages.push(p);
    }
    matchingIndex = -1;
    $('search').dataset.previousTerm = term;
  }
  if (!matchingPages.length) { $('find-result').textContent = '見つかりません'; highlight(); return; }
  matchingIndex = (matchingIndex + 1) % matchingPages.length;
  currentPage = matchingPages[matchingIndex];
  $('find-result').textContent = `${matchingIndex + 1} / ${matchingPages.length}ページ`;
  await renderPage();
}
$('find-next').addEventListener('click', findNext);
$('search').addEventListener('keydown', event => { if (event.key === 'Enter') findNext(); });
$('search').addEventListener('input', highlight);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault(); $('search').focus(); $('search').select();
  }
});
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  if (documentPdf && zoomMode === 'fit') resizeTimer = setTimeout(renderPage, 120);
}).observe($('pages'));
updateControls();
if (window.parent !== window) {
  app.connect().then(async () => {
    openai.resources?.addUpdateHandler(async ({ params }) => {
      if (params.uri === activeResourceUri && lastInput) {
        try { await readHostInput(lastInput); } catch (error) { status(error.message || String(error), 'error'); }
      }
    });
    if (lastInput) await readHostInput(lastInput);
  }).catch(error => status(`ホストに接続できませんでした：${error.message || error}`, 'error'));
}
