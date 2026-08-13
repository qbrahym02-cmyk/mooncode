const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const icons = {
  spark: '<svg viewBox="0 0 24 24"><path d="m12 3 1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/></svg>',
  terminal: '<svg viewBox="0 0 24 24"><path d="m5 7 4 4-4 4M11 17h7"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
  command: '<svg viewBox="0 0 24 24"><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  chevrons: '<svg viewBox="0 0 24 24"><path d="m8 9 4-4 4 4M16 15l-4 4-4-4"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-1L20 12M4 12l2.3 5a7 7 0 0 0 11.6-1"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M5 12v7h14v-7"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"/><circle cx="12" cy="12" r="3"/></svg>',
  bug: '<svg viewBox="0 0 24 24"><path d="M8 8h8v7a4 4 0 0 1-8 0V8ZM9 5l-2-2M15 5l2-2M4 11h4M16 11h4M4 16h4M16 16h4"/><path d="M10 8V6h4v2"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3V6Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8"/></svg>',
  'arrow-up': '<svg viewBox="0 0 24 24"><path d="M12 19V5m0 0L7 10m5-5 5 5"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v6H4V5h6"/></svg>',
  diff: '<svg viewBox="0 0 24 24"><path d="M6 3v18M18 3v18M3 7h6M15 17h6"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.2h4.3a2 2 0 0 1 0 4H9.5h5"/></svg>',
};

$$('[data-icon]').forEach((node) => { node.innerHTML = icons[node.dataset.icon] || icons.spark; });

const state = {
  bootstrap: null,
  running: false,
  mode: 'build',
  provider: localStorage.getItem('zetora.provider') || 'demo',
  model: localStorage.getItem('zetora.model') || 'demo-local',
  baseUrl: localStorage.getItem('zetora.baseUrl') || '',
  sessionId: 'welcome',
  transcript: [],
  files: [],
  changes: [],
  cumulative: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
  pendingImage: null,
  git: null,
  treeRefreshTimer: null,
  voiceAutoSend: localStorage.getItem('zetora.voiceAutoSend') !== 'false',
  voiceLang: localStorage.getItem('zetora.voiceLang') || 'ar-SA',
};

const timeline = $('#timeline');
const prompt = $('#prompt');
const sendButton = $('#send-button');

function toast(message, icon = 'spark', timeout = 3200) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.innerHTML = `${icons[icon] || icons.spark}<span></span>`;
  $('span', item).textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), timeout);
}

function setBusy(value) {
  state.running = value;
  sendButton.disabled = value;
  sendButton.innerHTML = value ? '<span class="thinking-dots"><i></i><i></i><i></i></span>' : icons['arrow-up'];
  prompt.disabled = value;
}

function resizePrompt() {
  prompt.style.height = 'auto';
  prompt.style.height = `${Math.min(prompt.scrollHeight, 170)}px`;
}

function scrollTimeline() {
  requestAnimationFrame(() => timeline.scrollTo({ top: timeline.scrollHeight, behavior: 'smooth' }));
}

function relativeTime(dateValue) {
  const diff = Math.max(0, Date.now() - new Date(dateValue).getTime());
  if (diff < 60_000) return 'الآن';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}د`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}س`;
  return `${Math.floor(diff / 86_400_000)}ي`;
}

function formatCost(cost) {
  if (!cost) return '';
  if (cost.costUsd == null) return `${cost.totalTokens} tok`;
  return `${cost.totalTokens} tok · $${cost.costUsd.toFixed(4)}`;
}

function renderSessions(sessions = []) {
  const list = $('#session-list');
  list.replaceChildren();
  for (const session of sessions) {
    const item = document.createElement('button');
    item.className = `session-item${session.id === state.sessionId ? ' is-active' : ''}`;
    item.dataset.sessionId = session.id;
    const usage = session.usage ? `<small class="session-usage">${formatCost(session.usage)}</small>` : '';
    item.innerHTML = '<span class="session-state"></span><span><strong></strong><small></small></span>' + icons.more;
    $('strong', item).textContent = session.title || 'Untitled session';
    $('small', item).textContent = `${relativeTime(session.updatedAt)} · ${session.mode || 'build'}`;
    if (usage) $('span:nth-child(2)', item).append(usage);
    item.addEventListener('click', () => selectSession(session));
    list.append(item);
  }
}

function renderTree(files = []) {
  state.files = files;
  const tree = $('#file-tree');
  tree.replaceChildren();
  for (const entry of files) {
    const row = document.createElement('button');
    row.className = 'tree-row';
    row.style.paddingLeft = `${7 + entry.depth * 13}px`;
    row.dataset.path = entry.path;
    row.dataset.type = entry.type;
    row.innerHTML = entry.type === 'directory' ? icons.folder : icons.file;
    if (entry.type === 'directory') $('svg', row)?.classList.add('folder-icon');
    const name = document.createElement('span');
    name.textContent = entry.name;
    row.append(name);
    if (entry.type === 'file') row.addEventListener('click', () => openFile(entry.path));
    tree.append(row);
  }
  $('#token-status').textContent = `${files.filter((item) => item.type === 'file').length} ملفًا في المشروع`;
}

async function openFile(filePath) {
  try {
    // Use the unified /api/artifact renderer which handles HTML, images, SVG,
    // markdown, JSON and source code in one consistent iframe document.
    const response = await fetch(`/api/artifact?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    const html = await response.text();
    document.documentElement.style.setProperty('--selected-file', filePath);
    const frame = $('#artifact-frame');
    const empty = $('#artifact-empty');
    empty.hidden = true;
    frame.hidden = false;
    frame.srcdoc = html;
    // Update the file label inside the artifact list.
    const artifactRow = $(`.artifact-row[data-path="${CSS.escape(filePath)}"]`);
    if (artifactRow) $$('.artifact-row').forEach((row) => row.classList.toggle('is-active', row === artifactRow));
    toggleInspector(true);
    // Refresh diff view if there are pending changes for this file.
    void refreshDiff(filePath);
    toast(`فتح ${filePath}`, 'file');
  } catch (error) { toast(error.message, 'warning'); }
}

async function refreshDiff(filePath) {
  try {
    const response = await fetch(`/api/diff?path=${encodeURIComponent(filePath)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    renderDiff(data);
  } catch (error) { /* silent: no diff available */ }
}

function renderDiff(diff) {
  const changesPanel = $('[data-view-panel="changes"]');
  const count = $('.tab-count');
  if (!diff || diff.previous == null) {
    changesPanel.innerHTML = `<div class="empty-state">${icons.diff}<h3>لا توجد تغييرات</h3><p>سيظهر diff واضح لكل ملف قبل اعتماده.</p></div>`;
    if (count) count.textContent = '0';
    return;
  }
  const lines = computeLineDiff(diff.previous ?? '', diff.next ?? '');
  const rows = lines.map((line) => {
    if (line.type === 'add') return `<div class="diff-line add"><span class="diff-gutter">+</span><code></code></div>`;
    if (line.type === 'del') return `<div class="diff-line del"><span class="diff-gutter">−</span><code></code></div>`;
    return `<div class="diff-line ctx"><span class="diff-gutter"> </span><code></code></div>`;
  });
  // Populate text via textContent to avoid HTML injection from file contents.
  changesPanel.innerHTML = `<div class="diff-toolbar"><strong></strong><span></span></div><div class="diff-stage">${rows.join('')}</div>`;
  $('.diff-toolbar strong', changesPanel).textContent = diff.path;
  $('.diff-toolbar span', changesPanel).textContent = diff.tool ? `${diff.tool} · ${relativeTime(diff.resolvedAt)}` : '';
  const codes = $$('code', changesPanel);
  lines.forEach((line, index) => { if (codes[index]) codes[index].textContent = line.text; });
  if (count) count.textContent = String(lines.filter((l) => l.type !== 'ctx').length);
}

function computeLineDiff(a, b) {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const max = Math.max(aLines.length, bLines.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    const la = aLines[i];
    const lb = bLines[i];
    if (la === lb) out.push({ type: 'ctx', text: lb ?? '' });
    else {
      if (la != null) out.push({ type: 'del', text: la });
      if (lb != null) out.push({ type: 'add', text: lb });
    }
  }
  return out;
}

async function loadWelcomeArtifact() {
  const welcome = state.files.find((item) => item.path === 'designs/welcome.html');
  if (welcome) await openFile(welcome.path);
}

function selectSession(session) {
  state.sessionId = session.id;
  state.transcript = session.messages || [];
  state.cumulative = session.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
  $('#session-title').textContent = session.title;
  timeline.replaceChildren();
  if (!state.transcript.length) renderHero();
  for (const message of state.transcript) appendMessage(message.role, message.content, false);
  renderSessions(state.bootstrap?.sessions || []);
  renderUsage();
  // Replay tool events from stored event log if available.
  for (const event of session.events || []) {
    if (event.type === 'tool.finished' && event.result?.diff) {
      registerChange({ path: event.result.path ?? event.input?.path ?? 'file', diff: event.result.diff, tool: event.name, at: event.at });
    }
  }
}

function renderHero() {
  timeline.innerHTML = `<div class="hero-intro"><div class="hero-orbit"><span></span><svg viewBox="0 0 32 32"><path d="M7 5h8v8H7zM17 5h8v8h-8zM7 15h8v12H7zM17 15h8v5h-8zM17 22h8v5h-8z"/></svg></div><p class="eyebrow">ZETORA WORKSPACE</p><h2>ماذا سنبني اليوم؟</h2><p>وكيل واحد للبرمجة والتصميم، يفهم مشروعك ويعرض كل خطوة قبل تنفيذها.</p><div class="starter-grid"><button data-starter="حلّل بنية المشروع ثم اقترح خطة تحسين عملية">${icons.scan}<span><strong>تحليل المشروع</strong><small>خريطة بنية ومخاطر وخطة</small></span></button><button data-starter="صمّم واجهة أصلية متجاوبة لهذا المشروع وأنشئها كـ artifact">${icons.layers}<span><strong>إنشاء تصميم</strong><small>واجهة ومعاينة قابلة للتعديل</small></span></button><button data-starter="ابحث عن الأخطاء المحتملة وشغّل الاختبارات الآمنة">${icons.bug}<span><strong>فحص الجودة</strong><small>أخطاء واختبارات وإصلاحات</small></span></button></div></div>`;
}

function clearHero() { $('.hero-intro', timeline)?.remove(); }

/**
 * Minimal, safe Markdown renderer. Supports headings, bold, inline code,
 * fenced code blocks, links, and paragraphs. All non-code text is escaped
 * before being placed in innerHTML, and links are restricted to http(s).
 */
function renderMarkdown(input) {
  const text = String(input ?? '');
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const blocks = [];
  let i = 0;
  const lines = text.split(/\r?\n/);
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(`<pre class="md-pre"${lang ? ` data-lang="${escape(lang)}"` : ''}><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push(`<h${level} class="md-h">${escape(line.slice(level + 1))}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${escape(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i += 1; }
      blocks.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^[-*]\s+/.test(lines[i])) {
      paragraph.push(lines[i]); i += 1;
    }
    blocks.push(`<p class="md-p">${inlineMd(escape(paragraph.join('\n')))}</p>`);
  }
  return blocks.join('');
}

function inlineMd(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function appendMessage(role, content = '', shouldScroll = true) {
  clearHero();
  const wrapper = document.createElement('article');
  wrapper.className = `message message-${role}`;
  if (role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;
    wrapper.append(bubble);
  } else {
    wrapper.innerHTML = `<div class="assistant-avatar"><svg viewBox="0 0 32 32"><path d="M7 5h8v8H7zM17 5h8v8h-8zM7 15h8v12H7zM17 15h8v5h-8zM17 22h8v5h-8z"/></svg></div><div class="message-content"><div class="assistant-text"></div><div class="message-meta">ZETORA · <span>الآن</span></div></div>`;
    const text = $('.assistant-text', wrapper);
    if (content) text.innerHTML = renderMarkdown(content);
  }
  timeline.append(wrapper);
  if (shouldScroll) scrollTimeline();
  return wrapper;
}

function addThinking() {
  const wrapper = appendMessage('assistant', '', false);
  $('.assistant-text', wrapper).innerHTML = `<div class="thinking"><span>يفكّر في المشروع</span><span class="thinking-dots"><i></i><i></i><i></i></span></div>`;
  scrollTimeline();
  return wrapper;
}

function addToolEvent(event) {
  let assistant = $('.message-assistant:last-of-type', timeline);
  if (!assistant) assistant = appendMessage('assistant', '', false);
  const content = $('.message-content', assistant);
  const card = document.createElement('section');
  card.className = 'tool-event';
  card.dataset.callId = event.callId || '';
  card.innerHTML = `<header>${icons.terminal}<strong></strong><span></span></header><pre></pre>`;
  $('strong', card).textContent = event.name;
  $('header span', card).textContent = event.risk || 'observe';
  $('pre', card).textContent = JSON.stringify(event.input || {}, null, 2);
  content.insertBefore(card, $('.message-meta', content));
  scrollTimeline();
}

function finishToolEvent(event) {
  const card = $(`.tool-event[data-call-id="${CSS.escape(event.callId || '')}"]`, timeline);
  if (!card) return;
  $('header span', card).textContent = 'done';
  $('pre', card).textContent = JSON.stringify(event.result, null, 2).slice(0, 6000);
  // If the tool produced a diff, register it for the Changes tab.
  if (event.result?.diff) {
    registerChange({ path: event.result.path ?? event.input?.path ?? 'file', diff: event.result.diff, tool: event.name, at: new Date().toISOString() });
  }
}

function registerChange(change) {
  state.changes = [change, ...state.changes.filter((item) => item.path !== change.path)].slice(0, 50);
  const count = $('.tab-count');
  if (count) count.textContent = String(state.changes.length);
}

function showApproval(approval) {
  const dock = $('#approval-dock');
  dock.hidden = false;
  dock.innerHTML = `<div class="approval-card">${icons.warning}<div><strong>هذه العملية تحتاج موافقتك</strong><code></code></div><div class="approval-actions"><button data-approval-action="deny">رفض</button><button class="approve" data-approval-action="approve">موافقة</button></div></div>`;
  $('code', dock).textContent = approval.summary || approval.tool?.name;
  $$('[data-approval-action]', dock).forEach((button) => button.addEventListener('click', () => resolveApproval(approval.id, button.dataset.approvalAction)));
}

async function resolveApproval(id, action) {
  try {
    const response = await fetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#approval-dock').hidden = true;
    toast(action === 'approve' ? 'تم تنفيذ العملية بعد موافقتك' : 'تم رفض العملية', action === 'approve' ? 'check' : 'warning');
    refreshFiles();
    if (action === 'approve' && result.result?.diff) {
      registerChange({ path: result.result.path ?? 'file', diff: result.result.diff, tool: 'write', at: new Date().toISOString() });
      void refreshDiff(result.result.path ?? '');
    }
  } catch (error) { toast(error.message, 'warning'); }
}

function renderUsage() {
  const usage = state.cumulative;
  if (!usage || (!usage.totalTokens && !usage.costUsd)) return;
  let node = $('#usage-pill');
  if (!node) {
    node = document.createElement('span');
    node.id = 'usage-pill';
    node.className = 'usage-pill';
    $('.session-meta')?.append(node);
  }
  node.innerHTML = `${icons.coin}<span></span>`;
  $('span', node).textContent = formatCost(usage) || '';
}

async function sendMessage(text = prompt.value.trim()) {
  if (!text || state.running) return;
  const history = state.transcript.slice(-20);
  state.transcript.push({ role: 'user', content: text });
  appendMessage('user', text);
  // If an image is attached, surface it in the user message bubble.
  const pendingImage = state.pendingImage;
  if (pendingImage) {
    const bubble = $('.message-user:last-of-type .message-bubble');
    if (bubble) {
      const img = document.createElement('img');
      img.src = pendingImage;
      img.className = 'message-image';
      img.alt = 'صورة مرفقة';
      bubble.append(img);
    }
  }
  prompt.value = '';
  resizePrompt();
  setBusy(true);
  const assistant = addThinking();
  const assistantText = $('.assistant-text', assistant);
  let received = '';
  try {
    // Build the prompt payload. When an image is attached, send the user
    // message as a multimodal content array so vision-capable providers can
    // consume both the text and the image.
    const promptPayload = pendingImage
      ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: pendingImage } }]
      : text;
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        prompt: promptPayload,
        history,
        mode: state.mode,
        provider: state.provider,
        model: state.model,
        baseUrl: state.baseUrl || undefined,
        apiKey: sessionStorage.getItem('zetora.apiKey') || undefined,
        stream: true,
      }),
    });
    // Clear the attached image after the request has been sent.
    state.pendingImage = null;
    $('#image-chip')?.remove();
    if (!response.ok) throw new Error((await response.json()).error || 'Request failed');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'text.delta') {
          if (!received) assistantText.innerHTML = '';
          received += event.delta;
          assistantText.innerHTML = renderMarkdown(received);
          scrollTimeline();
        } else if (event.type === 'text.done') {
          if (event.text) {
            received = event.text;
            assistantText.innerHTML = renderMarkdown(received);
          }
        } else if (event.type === 'tool.started') addToolEvent(event);
        else if (event.type === 'tool.finished') finishToolEvent(event);
        else if (event.type === 'approval.required') showApproval(event.approval);
        else if (event.type === 'usage' && event.cost) {
          state.cumulative = event.cost;
          renderUsage();
        } else if (event.type === 'error') {
          if (!received) assistantText.textContent = `تعذّر إكمال الطلب: ${event.message}`;
          toast(event.message, 'warning', 5000);
        }
      }
      if (done) break;
    }
    if (!received && $('.thinking', assistantText)) assistantText.textContent = 'انتهت العملية دون رسالة نصية.';
    if (received) state.transcript.push({ role: 'assistant', content: received });
    $('.message-meta span', assistant).textContent = `${state.provider} / ${state.model}`;
  } catch (error) {
    assistantText.textContent = `حدث خطأ في الاتصال: ${error.message}`;
    toast(error.message, 'warning', 5000);
  } finally {
    setBusy(false);
    prompt.focus();
  }
}

function toggleInspector(force) {
  const shell = $('#app');
  const current = shell.dataset.inspector === 'true';
  shell.dataset.inspector = String(force ?? !current);
}

function toggleSidebar(force) {
  const shell = $('#app');
  const current = shell.dataset.sidebar === 'true';
  shell.dataset.sidebar = String(force ?? !current);
}

function toggleTerminal() {
  const terminal = $('#terminal-drawer');
  terminal.hidden = !terminal.hidden;
  if (!terminal.hidden) $('#terminal-input').focus();
}

async function runTerminal(command, approved = false) {
  const output = $('#terminal-output');
  const line = document.createElement('div');
  line.innerHTML = '<span class="terminal-prompt">zetora ›</span> ';
  line.append(document.createTextNode(command));
  output.append(line);
  try {
    const response = await fetch('/api/terminal', { method: 'POST', headers: { 'content-type': 'application/json', ...(approved ? { 'x-zetora-confirm': 'execute' } : {}) }, body: JSON.stringify({ command }) });
    const result = await response.json();
    if (response.status === 202 && result.approvalRequired) {
      const accepted = window.confirm(`السماح بتنفيذ هذا الأمر داخل المشروع؟\n\n${command}`);
      if (accepted) return runTerminal(command, true);
      const denied = document.createElement('div'); denied.className = 'terminal-error'; denied.textContent = 'تم رفض الأمر.'; output.append(denied);
    } else if (!response.ok) throw new Error(result.error);
    else {
      const pre = document.createElement('div');
      pre.textContent = result.stdout || result.stderr || `(exit ${result.code})`;
      if (result.code) pre.className = 'terminal-error';
      output.append(pre);
    }
  } catch (error) { const item = document.createElement('div'); item.className = 'terminal-error'; item.textContent = error.message; output.append(item); }
  output.scrollTop = output.scrollHeight;
}

function openSettings() {
  const dialog = $('#settings-dialog');
  $('#provider-select').value = state.provider;
  $('#settings-model').value = state.model;
  $('#settings-base-url').value = state.baseUrl;
  $('#settings-api-key').value = sessionStorage.getItem('zetora.apiKey') || '';
  updateProviderFields();
  dialog.showModal();
}

function updateProviderFields() {
  const provider = $('#provider-select').value;
  $('#base-url-field').hidden = provider !== 'custom';
  $('#api-key-field').hidden = ['demo', 'ollama'].includes(provider);
  const defaults = { demo: 'demo-local', openai: 'gpt-5-mini', anthropic: 'claude-sonnet-4-5', google: 'gemini-2.5-flash', openrouter: 'openai/gpt-5-mini', ollama: 'qwen3-coder', custom: 'custom-model' };
  $('#settings-model').placeholder = defaults[provider];
}

function saveSettings() {
  state.provider = $('#provider-select').value;
  state.model = $('#settings-model').value.trim() || 'demo-local';
  state.baseUrl = $('#settings-base-url').value.trim();
  localStorage.setItem('zetora.provider', state.provider);
  localStorage.setItem('zetora.model', state.model);
  localStorage.setItem('zetora.baseUrl', state.baseUrl);
  const key = $('#settings-api-key').value.trim();
  if (key) sessionStorage.setItem('zetora.apiKey', key); else sessionStorage.removeItem('zetora.apiKey');
  $('#model-label').textContent = state.model;
  $('#session-model-label').textContent = state.model;
  $('#settings-dialog').close();
  toast('تم حفظ إعدادات النموذج', 'check');
}

async function testProvider() {
  const status = $('#provider-status');
  status.textContent = 'Testing connection…';
  try {
    const response = await fetch('/api/providers/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: $('#provider-select').value, model: $('#settings-model').value, baseUrl: $('#settings-base-url').value || undefined, apiKey: $('#settings-api-key').value || undefined }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    status.textContent = `✓ Connected — ${data.text}`;
    status.style.color = 'var(--mint)';
  } catch (error) { status.textContent = `✕ ${error.message}`; status.style.color = 'var(--red)'; }
}

function newSession() {
  state.sessionId = crypto.randomUUID();
  state.transcript = [];
  state.cumulative = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
  state.changes = [];
  $('#session-title').textContent = 'جلسة جديدة';
  renderHero();
  prompt.focus();
  toast('بدأت جلسة محلية جديدة', 'plus');
  if (innerWidth < 680) toggleSidebar(false);
  // Persist on the server so it shows up after refresh.
  fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: state.sessionId, title: 'جلسة جديدة', mode: state.mode }) }).catch(() => {});
}

async function refreshFiles() {
  try {
    const response = await fetch('/api/tree?depth=6');
    const files = await response.json();
    if (!response.ok) throw new Error(files.error);
    renderTree(files);
  } catch (error) { toast(error.message, 'warning'); }
}

function exportSession() {
  const markdown = [`# ${$('#session-title').textContent}`, '', ...state.transcript.map((item) => `## ${item.role === 'user' ? 'User' : 'Zetora'}\n\n${item.content}\n`) ].join('\n');
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `zetora-session-${new Date().toISOString().slice(0, 10)}.md`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('تم تصدير الجلسة', 'share');
}

function handleAction(action) {
  if (action === 'send') return sendMessage();
  if (action === 'new-session') return newSession();
  if (['command', 'search'].includes(action)) return $('#command-dialog').showModal();
  if (action === 'settings' || action === 'model-menu') return openSettings();
  if (action === 'resources') return openResources();
  if (action === 'toggle-inspector') return toggleInspector();
  if (action === 'close-inspector') return toggleInspector(false);
  if (action === 'sidebar') return toggleSidebar();
  if (action === 'terminal') return toggleTerminal();
  if (action === 'refresh-files') return refreshFiles();
  if (action === 'refresh-preview') return loadWelcomeArtifact();
  if (action === 'share') return exportSession();
  if (action === 'save-settings') return saveSettings();
  if (action === 'test-provider') return testProvider();
  if (action === 'attach') return attachImage();
  if (action === 'voice') return toggleVoiceInput();
  if (action === 'git-status') return refreshGit();
  if (action === 'git-undo') return undoLastCheckpoint();
  if (action === 'compact') return compactSession();
  if (action === 'refresh-graph') return refreshGitGraph();
  if (action === 'mode-menu') {
    const modes = ['build', 'plan', 'design'];
    state.mode = modes[(modes.indexOf(state.mode) + 1) % modes.length];
    const label = state.mode[0].toUpperCase() + state.mode.slice(1);
    $('#mode-label').textContent = label; $('#session-mode-label').textContent = label;
    toast(`الوضع: ${label}`, 'spark');
  }
}

/**
 * Resources dialog: manage context files, skills, MCP servers, and design tokens.
 * Each tab fetches its data lazily and renders into the same section element.
 */
function openResources() {
  $('#resources-dialog').showModal();
  loadContextList();
}

async function loadContextList() {
  const list = $('#context-list');
  list.replaceChildren();
  try {
    const response = await fetch('/api/context');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!data.files?.length) {
      list.innerHTML = '<div class="empty-state"><p>لا توجد ملفات سياق بعد. أضف ملفًا مثل CONVENTIONS.md ليُحقن في كل استدعاء نموذج.</p></div>';
      return;
    }
    for (const entry of data.files) {
      const item = document.createElement('div');
      item.className = 'context-row-item';
      const meta = document.createElement('div');
      meta.innerHTML = `<strong></strong><small></small>`;
      $('strong', meta).textContent = entry.path;
      $('small', meta).textContent = entry.description || 'بدون وصف';
      const remove = document.createElement('button');
      remove.textContent = 'إزالة';
      remove.addEventListener('click', () => removeContext(entry.path));
      item.append(meta, remove);
      list.append(item);
    }
  } catch (error) { toast(error.message, 'warning'); }
}

async function addContext(path, description) {
  try {
    const response = await fetch('/api/context', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, description }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    toast(`أُضيف ${path} للسياق`, 'check');
    loadContextList();
  } catch (error) { toast(error.message, 'warning'); }
}

async function removeContext(path) {
  try {
    const response = await fetch('/api/context', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    toast(`أُزيل ${path} من السياق`, 'check');
    loadContextList();
  } catch (error) { toast(error.message, 'warning'); }
}

async function compactSession() {
  if (!confirm('ضغط سجل الجلسة الحالية؟ سيُلخّص الـ30 رسالة الأقدم إلى ملخص مدمج.')) return;
  try {
    const response = await fetch('/api/compact', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        provider: state.provider, model: state.model,
        apiKey: sessionStorage.getItem('zetora.apiKey') || undefined,
        baseUrl: state.baseUrl || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (data.compacted) {
      toast(`ضُغطت ${data.compactedCount} رسالة`, 'check');
      // Reload the session to reflect the new compacted history.
      bootstrap();
    } else {
      toast('لا حاجة للضغط بعد', 'spark');
    }
  } catch (error) { toast(error.message, 'warning'); }
}

/**
 * Attach an image (vision input). Reads the file as a data URI, uploads it to
 * the server for persistence, and surfaces it as a chip in the composer.
 * The next send will include the image as a multimodal message part.
 */
function attachImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) return toast('الصورة أكبر من 8 ميجابايت', 'warning');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result;
      // Persist server-side so the agent can reference it across requests.
      const form = new FormData();
      form.append('file', file);
      try {
        const response = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.pendingImage = data.dataUri;
        renderAttachmentChip(file.name);
        toast(`أُرفقت الصورة: ${file.name}`, 'check');
      } catch (error) { toast(error.message, 'warning'); }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function renderAttachmentChip(name) {
  const row = $('#context-row');
  let chip = $('#image-chip');
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'image-chip';
    chip.className = 'context-chip image-chip';
    chip.innerHTML = `${icons.file}<span></span><span class="chip-remove">×</span>`;
    chip.addEventListener('click', (event) => {
      if (event.target.classList.contains('chip-remove')) {
        state.pendingImage = null;
        chip.remove();
      }
    });
    row.append(chip);
  }
  $('span:not(.chip-remove)', chip).textContent = name.slice(0, 24);
}

async function refreshGit() {
  try {
    const response = await fetch('/api/git/status');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!data.repository) {
      // Initialize lazily on first interaction.
      await fetch('/api/git/init', { method: 'POST' });
      return refreshGit();
    }
    state.git = data;
    renderGitStatus(data);
  } catch (error) { toast(error.message, 'warning'); }
}

function renderGitStatus(gitStatus) {
  let node = $('#git-pill');
  if (!node) {
    node = document.createElement('span');
    node.id = 'git-pill';
    node.className = 'git-pill';
    $('.session-meta')?.append(node);
  }
  const untracked = (gitStatus.files || []).filter((f) => f.untracked).length;
  const modified = (gitStatus.files || []).filter((f) => !f.untracked).length;
  node.innerHTML = `${icons.check}<span></span>`;
  $('span', node).textContent = modified + untracked > 0 ? `${modified}+${untracked} على ${gitStatus.head}` : `clean · ${gitStatus.head}`;
}

async function undoLastCheckpoint() {
  if (!confirm('تراجع عن آخر checkpoint؟ سيُسترجع المحتوى السابق للملفات المتأثرة.')) return;
  try {
    const response = await fetch('/api/git/undo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (data.undone) {
      toast('تم التراجع عن آخر checkpoint', 'check');
      refreshFiles();
      refreshGit();
    } else {
      toast(`لا يمكن التراجع: ${data.reason || data.error || 'غير معروف'}`, 'warning');
    }
  } catch (error) { toast(error.message, 'warning'); }
}

/**
 * Connect to the server-sent events stream for file watcher updates. When a
 * file changes, the inspector preview auto-refreshes if it's currently showing
 * that file, and the file tree is silently re-fetched.
 */
function connectWatcher() {
  try {
    const source = new EventSource('/api/events');
    source.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'file.changed') {
        const currentFile = document.documentElement.style.getPropertyValue('--selected-file');
        if (currentFile && currentFile === data.path) {
          openFile(currentFile);
        }
        // Throttle tree refresh to once every 800ms per burst.
        clearTimeout(state.treeRefreshTimer);
        state.treeRefreshTimer = setTimeout(refreshFiles, 800);
      }
    });
    source.addEventListener('error', () => { /* will auto-reconnect */ });
  } catch (error) { /* SSE not supported — non-fatal */ }
}

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) handleAction(action);
  const starter = event.target.closest('[data-starter]')?.dataset.starter;
  if (starter) { prompt.value = starter; resizePrompt(); sendMessage(starter); }
});

prompt.addEventListener('input', resizePrompt);
prompt.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); }
});

$('#terminal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#terminal-input'); const value = input.value.trim();
  if (value) { input.value = ''; runTerminal(value); }
});

$('#context-add-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const path = $('#context-path-input').value.trim();
  const desc = $('#context-desc-input').value.trim();
  if (!path) return;
  $('#context-path-input').value = '';
  $('#context-desc-input').value = '';
  addContext(path, desc);
});

$$('[data-inspector-tab]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-inspector-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === button.dataset.inspectorTab));
}));

$('#provider-select').addEventListener('change', updateProviderFields);
$$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close()));
$$('[data-command-action]').forEach((button) => button.addEventListener('click', () => { $('#command-dialog').close(); handleAction(button.dataset.commandAction); }));
$('#command-input').addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase();
  $$('.command-list button').forEach((button) => { button.hidden = !button.textContent.toLowerCase().includes(query); });
});

for (const dialog of $$('dialog')) dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#command-dialog').showModal(); }
  if (mod && event.key.toLowerCase() === 'n') { event.preventDefault(); newSession(); }
  if (mod && event.key.toLowerCase() === 'j') { event.preventDefault(); toggleTerminal(); }
  if (mod && event.key === '.') { event.preventDefault(); toggleInspector(); }
  if (mod && event.key === ',') { event.preventDefault(); openSettings(); }
  if (mod && event.key.toLowerCase() === 'r') { event.preventDefault(); openResources(); }
  if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); compactSession(); }
});

// ---- Voice input (Web Speech API) ----
let recognition = null;
let voiceFinalTranscript = '';
function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return toast('الإدخال الصوتي غير مدعوم في هذا المتصفح', 'warning');
  if (recognition) { recognition.stop(); recognition = null; return; }
  recognition = new SpeechRecognition();
  recognition.lang = state.voiceLang || 'ar-SA';
  recognition.continuous = false;
  recognition.interimResults = true;
  voiceFinalTranscript = '';
  const button = $('[data-action="voice"]');
  button?.classList.add('voice-active');
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = 0; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) voiceFinalTranscript += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    prompt.value = (voiceFinalTranscript + interim).trim();
    resizePrompt();
  };
  recognition.onerror = (event) => { toast(`خطأ صوتي: ${event.error}`, 'warning'); };
  recognition.onend = () => {
    button?.classList.remove('voice-active');
    recognition = null;
    if (voiceFinalTranscript.trim()) {
      toast('تم استلام النص، جاري الإرسال...', 'check');
      // Auto-send the final transcript if the user enabled auto-send (default on).
      if (state.voiceAutoSend !== false) {
        setTimeout(() => {
          if (prompt.value.trim()) sendMessage();
        }, 300);
      }
    } else {
      toast('لم يتم التقاط صوت', 'warning');
    }
  };
  recognition.start();
  toast('تحدث الآن... اضغط مجددًا للإيقاف', 'command');
}

// ---- Todos panel ----
async function refreshTodos() {
  try {
    const response = await fetch('/api/todos');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    renderTodos(data.items || [], data.summary || {});
  } catch (error) { /* silent */ }
}

function renderTodos(items, summary) {
  const list = $('#todo-list');
  const count = $('#todo-count');
  const progress = $('#todo-progress');
  if (count) count.textContent = String(items.length);
  if (progress) progress.textContent = `${summary.progress || 0}%`;
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><p>لا توجد مهام بعد. الوكيل سيضيف مهام تلقائيًا، أو أضفها يدويًا.</p></div>';
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = `todo-item ${item.status}`;
    row.innerHTML = `<button class="todo-checkbox ${item.status === 'completed' ? 'checked' : ''}"></button><span class="todo-content"></span><button class="todo-remove">×</button>`;
    $('.todo-content', row).textContent = item.content;
    $('.todo-checkbox', row).addEventListener('click', () => toggleTodo(item.id, item.status === 'completed' ? 'pending' : 'completed'));
    $('.todo-remove', row).addEventListener('click', () => removeTodo(item.id));
    list.append(row);
  }
}

async function addTodo(content) {
  try {
    await fetch('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', content }) });
    refreshTodos();
  } catch (error) { toast(error.message, 'warning'); }
}

async function toggleTodo(id, status) {
  try {
    await fetch('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', id, status }) });
    refreshTodos();
  } catch (error) { toast(error.message, 'warning'); }
}

async function removeTodo(id) {
  try {
    await fetch('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) });
    refreshTodos();
  } catch (error) { toast(error.message, 'warning'); }
}

// ---- Git graph (SVG) ----
async function refreshGitGraph() {
  const container = $('#git-graph');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><p>جاري التحميل...</p></div>';
  try {
    const response = await fetch('/api/git-graph?limit=30');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    renderGitGraph(data);
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`;
  }
}

function renderGitGraph(data) {
  const container = $('#git-graph');
  const { commits = [], edges = [], branches = { branches: [] } } = data;
  if (!commits.length) {
    container.innerHTML = '<div class="empty-state"><p>لا توجد commits. شغّل Git init أولًا.</p></div>';
    return;
  }
  // Simple vertical layout: each commit is a circle at y = index * 30.
  const laneWidth = 40;
  const rowHeight = 30;
  const width = Math.max(400, 400);
  const height = commits.length * rowHeight + 40;
  const commitY = (i) => 20 + i * rowHeight;
  const commitX = (i) => 40 + (i % 3) * laneWidth;
  let svg = `<svg class="graph-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">`;
  // Edges first (so they appear under nodes).
  for (const edge of edges) {
    const x1 = commitX(edge.from);
    const y1 = commitY(edge.from);
    const x2 = commitX(edge.to);
    const y2 = commitY(edge.to);
    svg += `<path class="graph-edge" d="M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}"/>`;
  }
  // Nodes + labels.
  commits.forEach((commit, i) => {
    const x = commitX(i);
    const y = commitY(i);
    const isHead = i === 0;
    svg += `<circle class="graph-commit ${isHead ? 'head' : ''}" cx="${x}" cy="${y}" r="5"/>`;
    svg += `<text class="graph-label" x="${x + 12}" y="${y + 4}">${commit.shortSha} ${escapeXml(commit.message.slice(0, 40))}</text>`;
  });
  svg += '</svg>';
  container.innerHTML = svg;
}

function escapeXml(s) { return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])); }

// ---- PWA service worker registration + install prompt ----
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  // Show an install button in the toast region.
  toast('تثبيت Zetora كتطبيق؟', 'command', 8000);
  // Auto-show after 3 seconds if user doesn't dismiss.
  setTimeout(() => {
    if (deferredPrompt) {
      const installToast = $('.toast:last-child');
      if (installToast) {
        const btn = document.createElement('button');
        btn.textContent = 'تثبيت';
        btn.className = 'primary-button';
        btn.style.cssText = 'height:26px;padding:0 10px;font-size:10px;margin-inline-start:8px';
        btn.addEventListener('click', async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') toast('تم التثبيت', 'check');
            deferredPrompt = null;
            btn.remove();
          }
        });
        installToast.append(btn);
      }
    }
  }, 1000);
});

window.addEventListener('appinstalled', () => {
  toast('تم تثبيت Zetora كـ PWA', 'check');
  deferredPrompt = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ---- Todos form ----
$('#todo-add-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#todo-input');
  const value = input.value.trim();
  if (value) { input.value = ''; addTodo(value); }
});

// Auto-refresh todos when inspector switches to that tab
$$('[data-inspector-tab]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.inspectorTab === 'todos') refreshTodos();
  if (button.dataset.inspectorTab === 'graph') refreshGitGraph();
}));

// Resources dialog: tab switching and forms.
$$('[data-resources-tab]').forEach((button) => button.addEventListener('click', async () => {
  $$('[data-resources-tab]').forEach((item) => item.classList.toggle('is-active', item === button));
  const section = $('#resources-dialog .settings-layout > section');
  const tab = button.dataset.resourcesTab;
  await renderResourcesTab(tab, section);
}));

async function renderResourcesTab(tab, section) {
  if (tab === 'context') return loadContextList();
  if (tab === 'skills') return loadSkills(section);
  if (tab === 'mcp') return loadMcp(section);
  if (tab === 'design') return loadDesignTokens(section);
}

async function loadSkills(section) {
  section.innerHTML = `<div class="setting-heading"><h3>المهارات</h3><p>قوالب prompt قابلة لإعادة الاستخدام. البuiltins متاحة دائمًا؛ أضف ملف <code>workspace/skills/&lt;id&gt;/skill.json</code> لمهارات مخصصة.</p></div><div id="skills-container"></div>`;
  const container = $('#skills-container', section);
  try {
    const response = await fetch('/api/skills');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const all = [...(data.builtin || []).map((s) => ({ ...s, builtin: true })), ...(data.skills || [])];
    if (!all.length) {
      container.innerHTML = '<div class="empty-state"><p>لا توجد مهارات بعد.</p></div>';
      return;
    }
    for (const skill of all) {
      const card = document.createElement('div');
      card.className = 'skill-card';
      const tag = skill.builtin ? '<span style="font:9px ZetoraMono;color:var(--mint);border:1px solid var(--line);padding:1px 5px;border-radius:4px">BUILTIN</span>' : '';
      card.innerHTML = `<div><strong></strong> ${tag}</div><small></small><div class="skill-actions"><button class="skill-run">تشغيل</button></div>`;
      $('strong', card).textContent = skill.name || skill.id;
      $('small', card).textContent = skill.description || '';
      $('.skill-run', card).addEventListener('click', () => invokeSkill(skill.id));
      container.append(card);
    }
  } catch (error) { toast(error.message, 'warning'); }
}

async function invokeSkill(id) {
  try {
    const response = await fetch('/api/skills/invoke', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, inputs: {} }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $('#resources-dialog').close();
    prompt.value = data.prompt;
    resizePrompt();
    if (data.mode && data.mode !== state.mode) {
      state.mode = data.mode;
      const label = state.mode[0].toUpperCase() + state.mode.slice(1);
      $('#mode-label').textContent = label;
      $('#session-mode-label').textContent = label;
    }
    toast(`استدعيت المهارة ${id}`, 'spark');
  } catch (error) { toast(error.message, 'warning'); }
}

async function loadMcp(section) {
  section.innerHTML = `<div class="setting-heading"><h3>خوادم MCP</h3><p>Model Context Protocol: وصّل أدوات وخوادم خارجية لاستخدامها في الوكيل. التهيئة في <code>.zetora/mcp.json</code>.</p></div><div id="mcp-container"></div>`;
  const container = $('#mcp-container', section);
  try {
    const response = await fetch('/api/mcp');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const servers = data.servers || [];
    const config = data.config || {};
    if (!servers.length && !Object.keys(config).length) {
      container.innerHTML = '<div class="empty-state"><p>لا توجد خوادم MCP مكوّنة. أضف خادمًا عبر API أو ضع ملف <code>mcp.json</code>.</p></div>';
      return;
    }
    for (const server of servers) {
      const card = document.createElement('div');
      card.className = 'mcp-server';
      const offline = server.closed;
      card.innerHTML = `<strong></strong><div class="mcp-status"><span class="dot"></span><span></span></div>`;
      $('strong', card).textContent = server.id;
      $('.mcp-status', card).classList.toggle('offline', offline);
      $('span:last-child', card).textContent = offline ? 'offline' : `online · ${server.serverInfo?.name || 'unknown'}`;
      container.append(card);
    }
  } catch (error) { toast(error.message, 'warning'); }
}

async function loadDesignTokens(section) {
  section.innerHTML = `<div class="setting-heading"><h3>Design tokens</h3><p>ألوان وخطوط ومسافات موحّدة لكل artifacts. تُحقن في system prompt في وضع Design.</p></div><div class="design-tokens-preview"><iframe id="tokens-preview-frame"></iframe></div><button class="primary-button" id="design-tokens-refresh">تحديث المعاينة</button>`;
  const frame = $('#tokens-preview-frame', section);
  try {
    const response = await fetch('/api/design-tokens');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!data.tokens) {
      frame.srcdoc = '<!doctype html><meta charset="utf-8"><style>html{background:#0b0c10;color:#747781;font:12px sans-serif}body{display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:18px}</style><body>لا توجد tokens بعد. أنشئ ملف design-tokens.json في مساحة العمل.</body>';
      return;
    }
    const htmlResponse = await fetch('/api/design-tokens/reference');
    frame.srcdoc = await htmlResponse.text();
  } catch (error) { toast(error.message, 'warning'); }
  $('#design-tokens-refresh', section)?.addEventListener('click', () => loadDesignTokens(section));
}

async function bootstrap() {
  try {
    const response = await fetch('/api/bootstrap');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state.bootstrap = data;
    state.files = data.files;
    $('#project-name').textContent = data.project?.name || data.product.name;
    $('#project-path').textContent = data.project?.path || 'local workspace';
    $('#app-version').textContent = `v${data.product.version}`;
    $('#model-label').textContent = state.model;
    $('#session-model-label').textContent = state.model;
    renderSessions(data.sessions);
    renderTree(data.files);
    if (data.git?.repository) renderGitStatus(data.git);
    const welcomeSession = data.sessions.find((item) => item.id === state.sessionId);
    if (welcomeSession?.messages?.length) selectSession(welcomeSession);
    for (const approval of data.approvals || []) showApproval(approval);
    await loadWelcomeArtifact();
    // Live updates: file watcher pushes changes the moment the workspace mutates.
    connectWatcher();
  } catch (error) {
    toast(`تعذر تحميل الخادم: ${error.message}`, 'warning', 7000);
    renderTree([]);
  }
}

if (innerWidth < 680) $('#app').dataset.sidebar = 'false';
resizePrompt();
bootstrap();
