// apps/chat/thread-code.js
// imports:
//   from '../../core/ui.js': createIcon, showToast, showBottomSheet

import {
  createIcon,
  showToast,
  showBottomSheet
} from '../../core/ui.js';

export function renderRichTextWithCode(text = '') {
  const wrap = el('div', 'rich-message-content');
  const source = String(text || '');

  if (!source.trim()) return wrap;

  const parts = splitMarkdownCodeBlocks(source);

  parts.forEach((part) => {
    if (part.type === 'code') {
      wrap.appendChild(renderCodeCard(part.code, part.lang));
      return;
    }

    appendTextBlocks(wrap, part.text);
  });

  return wrap;
}

function splitMarkdownCodeBlocks(source) {
  const parts = [];
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match = null;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        text: source.slice(lastIndex, match.index)
      });
    }

    parts.push({
      type: 'code',
      lang: normalizeLang(match[1]),
      code: String(match[2] || '').replace(/\n$/, '')
    });

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) {
    parts.push({
      type: 'text',
      text: source.slice(lastIndex)
    });
  }

  if (!parts.length) {
    parts.push({
      type: 'text',
      text: source
    });
  }

  return parts;
}

function renderCodeCard(code = '', lang = '') {
  const details = document.createElement('details');
  details.className = 'code-card';
  details.open = false;

  const summary = el('summary', 'code-card-summary');

  const meta = el('span', 'code-card-meta');
  meta.append(
    el('span', 'code-card-title', getCodeTitle(lang)),
    el('span', 'code-card-desc', `${countLines(code)} 行，可展开查看`)
  );

  const actions = el('span', 'code-card-actions');

  const copy = smallButton('复制', 'copy');
  copy.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await copyCode(code);
  });

  const save = smallButton('保存', 'download');
  save.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveCodeFile(code, lang);
  });

  const view = smallButton('查看', 'eye');
  view.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCodeViewer(code, lang);
  });

  actions.append(copy, save, view);

  summary.append(meta, actions);

  const body = el('div', 'code-card-body');
  const pre = document.createElement('pre');
  pre.className = 'code-pre';

  const codeEl = document.createElement('code');
  codeEl.className = lang ? `language-${lang}` : '';
  codeEl.textContent = code || '';

  pre.appendChild(codeEl);
  body.appendChild(pre);

  details.append(summary, body);
  return details;
}

function openCodeViewer(code = '', lang = '') {
  const sheet = el('div', 'thread-sheet code-viewer-sheet');

  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', getCodeTitle(lang)),
    el('div', 'chat-sheet-subtitle', lang === 'html' ? '可以直接预览 HTML' : '查看完整代码')
  );

  const actions = el('div', 'code-viewer-actions');

  const copy = button('复制代码', 'ghost', 'copy');
  copy.addEventListener('click', () => copyCode(code));

  const save = button('保存文件', 'ghost', 'download');
  save.addEventListener('click', () => saveCodeFile(code, lang));

  actions.append(copy, save);

  sheet.append(head, actions);

  if (lang === 'html') {
    const preview = el('div', 'code-preview-wrap');

    const iframe = document.createElement('iframe');
    iframe.className = 'code-preview-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
    iframe.srcdoc = code || '';

    preview.appendChild(iframe);
    sheet.appendChild(preview);
  }

  const pre = document.createElement('pre');
  pre.className = 'code-viewer-pre';

  const codeEl = document.createElement('code');
  codeEl.textContent = code || '';

  pre.appendChild(codeEl);
  sheet.appendChild(pre);

  showBottomSheet(sheet);
}

async function copyCode(code = '') {
  const text = String(code || '');

  try {
    await navigator.clipboard.writeText(text);
    showToast('代码复制好了');
  } catch (_) {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';

  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    showToast('代码复制好了');
  } catch (_) {
    showToast('复制失败，可以手动长按复制');
  }

  textarea.remove();
}

function saveCodeFile(code = '', lang = '') {
  const filename = getFileName(lang);
  const type = getMimeType(lang);
  const blob = new Blob([String(code || '')], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 600);

  showToast('文件开始保存');
}

function appendTextBlocks(wrap, text = '') {
  const clean = String(text || '');
  if (!clean.trim()) return;

  const blocks = clean
    .replace(/\r/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  blocks.forEach((block) => {
    const paragraph = el('div', 'rich-text-block');

    const lines = block.split('\n');

    lines.forEach((line, index) => {
      if (index > 0) paragraph.appendChild(document.createElement('br'));
      paragraph.appendChild(document.createTextNode(line));
    });

    wrap.appendChild(paragraph);
  });
}

function normalizeLang(lang = '') {
  const raw = String(lang || '').trim().toLowerCase();

  if (!raw) return '';
  if (raw === 'javascript' || raw === 'node' || raw === 'jsx') return 'js';
  if (raw === 'typescript' || raw === 'tsx') return 'ts';
  if (raw === 'html5') return 'html';
  if (raw === 'css3') return 'css';
  if (raw === 'py') return 'python';
  if (raw === 'shell' || raw === 'bash' || raw === 'zsh') return 'sh';

  return raw.replace(/[^\w-]/g, '');
}

function getCodeTitle(lang = '') {
  const normalized = normalizeLang(lang);

  if (!normalized) return '代码';
  if (normalized === 'html') return 'HTML 代码';
  if (normalized === 'css') return 'CSS 代码';
  if (normalized === 'js') return 'JavaScript 代码';
  if (normalized === 'ts') return 'TypeScript 代码';
  if (normalized === 'json') return 'JSON 代码';
  if (normalized === 'python') return 'Python 代码';
  if (normalized === 'sh') return 'Shell 代码';

  return `${normalized.toUpperCase()} 代码`;
}

function getFileName(lang = '') {
  const normalized = normalizeLang(lang);

  if (normalized === 'html') return 'index.html';
  if (normalized === 'css') return 'style.css';
  if (normalized === 'js') return 'script.js';
  if (normalized === 'ts') return 'script.ts';
  if (normalized === 'json') return 'data.json';
  if (normalized === 'python') return 'main.py';
  if (normalized === 'sh') return 'script.sh';

  return 'code.txt';
}

function getMimeType(lang = '') {
  const normalized = normalizeLang(lang);

  if (normalized === 'html') return 'text/html;charset=utf-8';
  if (normalized === 'css') return 'text/css;charset=utf-8';
  if (normalized === 'js') return 'text/javascript;charset=utf-8';
  if (normalized === 'json') return 'application/json;charset=utf-8';

  return 'text/plain;charset=utf-8';
}

function countLines(code = '') {
  const text = String(code || '');
  if (!text) return 0;
  return text.split('\n').length;
}

function smallButton(text, iconName) {
  const btn = el('button', 'code-card-action');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 13));
  btn.appendChild(el('span', '', text));

  return btn;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 依赖：../../core/ui.js(createIcon,showToast,showBottomSheet)
