// apps/chat/markdown.js
// 轻量 Markdown 渲染器——纯手写解析，无外部依赖。
// 支持：代码块(```)、行内代码(``)、加粗(**)、斜体(*)、链接([text](url))、
//      列表(-/*)、标题(#)、引用(>)、图片(![alt](url))
// 安全策略：先转义 HTML，再替换 markdown 语法；链接只允许 http/https 协议。
// 依赖：无

// ════════════════════════════════════════
// HTML 转义（XSS 消毒第一步）
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * 校验 URL 仅允许 http/https（防止 javascript:/data: 等 XSS）
 * @param {string} url
 * @returns {string} 安全的 URL（不合法返回空串）
 */
function safeURL(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  // 允许 http/https 协议
  if (/^https?:\/\//i.test(u)) return u;
  // 允许相对路径 / 锚点（无协议）
  if (/^\//.test(u) || /^\.\/?/.test(u) || /^#/.test(u)) return u;
  // 允许 mailto / tel（常见安全协议）
  if (/^mailto:/i.test(u) || /^tel:/i.test(u)) return u;
  // 拒绝任何其它带协议的 URL（javascript:、data:、vbscript:、file: 等）
  // 形如 scheme:... 但不是上述已允许的，直接拒绝
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
  // 无协议的裸路径/域名（不含冒号）放行
  return u;
}

// ════════════════════════════════════════
// 行内标记解析（在已转义的文本上操作）
// ════════════════════════════════════════

/**
 * 解析行内 markdown：加粗/斜体/行内代码/链接/图片
 * 输入文本必须已经过 escapeHTML。
 * @param {string} text
 * @returns {string}
 */
function renderInline(text) {
  // 占位符替换策略：先把代码块和行内代码替换成占位符，避免内部被其它语法处理
  const placeholders = [];
  const stash = (html) => {
    const key = `\u0000PH${placeholders.length}\u0000`;
    placeholders.push(html);
    return key;
  };

  let out = text;

  // 1) 行内代码 `code`（先处理，内部不再解析）
  out = out.replace(/`([^`\n]+)`/g, (_, code) => {
    // code 已转义过，直接包裹
    return stash(`<code class="md-code">${code}</code>`);
  });

  // 2) 图片 ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\s*(?:"([^"]*)")?\)/g, (_, alt, url, title) => {
    const safeU = safeURL(url);
    if (!safeU) return _;
    const altAttr = escapeHTML(alt || '');
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    return stash(`<img class="md-img" src="${escapeHTML(safeU)}" alt="${altAttr}"${titleAttr} loading="lazy">`);
  });

  // 3) 链接 [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\s*(?:"([^"]*)")?\)/g, (_, label, url, title) => {
    const safeU = safeURL(url);
    if (!safeU) return _;
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    return `<a class="md-link" href="${escapeHTML(safeU)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${label}</a>`;
  });

  // 4) 加粗 **text**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // 5) 斜体 *text*（避免与加粗冲突，要求 * 后非空白）
  out = out.replace(/(^|[^*])\*([^*\n\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');

  // 6) 还原占位符
  placeholders.forEach((html, i) => {
    out = out.replace(`\u0000PH${i}\u0000`, html);
  });

  return out;
}

// ════════════════════════════════════════
// 块级解析
// ════════════════════════════════════════

/**
 * 主入口：把 markdown 文本渲染成安全 HTML 字符串。
 * @param {string} text 原始 markdown 文本
 * @returns {string} 安全的 HTML
 */
export function renderMarkdown(text) {
  if (text == null) return '';
  const src = String(text);
  // 第一步：整体 HTML 转义
  const escaped = escapeHTML(src);

  // 按行切分，处理块级
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── 代码块 ```lang
    // 输出带 wrap 的结构，方便 code-block.js 加工具栏（复制/下载/预览/折叠）
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] || '').toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束的 ```
      const langClass = lang ? ` language-${escapeHTML(lang)}` : '';
      const langLabel = lang ? escapeHTML(lang) : 'text';
      // 用 data-lang 标记语言，code-block.js 据此判断是否显示"预览"按钮（html/htm/svg 可预览）
      const canPreview = /^(html?|svg|xml)$/i.test(lang);
      out.push(
        `<div class="md-code-wrap" data-lang="${langLabel}" data-can-preview="${canPreview ? '1' : '0'}">` +
        `<div class="md-code-head">` +
        `<span class="md-code-lang">${langLabel}</span>` +
        `<div class="md-code-actions">` +
        `<button class="md-code-btn" data-action="copy" type="button">复制</button>` +
        `<button class="md-code-btn" data-action="download" type="button">下载</button>` +
        (canPreview ? `<button class="md-code-btn" data-action="preview" type="button">预览</button>` : '') +
        `<button class="md-code-btn md-code-toggle" data-action="toggle" type="button" aria-label="折叠/展开"></button>` +
        `</div>` +
        `</div>` +
        `<div class="md-code-body">` +
        `<pre class="md-pre"><code class="md-code-block${langClass}">${codeLines.join('\n')}</code></pre>` +
        `</div>` +
        `</div>`
      );
      continue;
    }

    // ── 标题 #..6
    const headMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headMatch) {
      const level = headMatch[1].length;
      const inner = renderInline(headMatch[2]);
      out.push(`<h${level} class="md-h md-h${level}">${inner}</h${level}>`);
      i++;
      continue;
    }

    // ── 引用 >（连续多行合并）
    if (/^&gt;\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^&gt;\s?/, ''));
        i++;
      }
      out.push(`<blockquote class="md-quote">${renderInline(quoteLines.join('<br>'))}</blockquote>`);
      continue;
    }

    // ── 无序列表 - 或 *
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li class="md-li">${renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }

    // ── 有序列表 1.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li class="md-li">${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="md-ol">${items.join('')}</ol>`);
      continue;
    }

    // ── 空行
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // ── 普通段落（连续非空非块行合并）
    const paraLines = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^&gt;\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p class="md-p">${renderInline(paraLines.join('<br>'))}</p>`);
    }
  }

  return out.join('\n');
}

export default { renderMarkdown };
