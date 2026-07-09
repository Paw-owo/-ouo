// ============================================
// chat-markdown.js — 轻量级 Markdown 渲染器
// 支持: h1-h3 / 粗体 / 斜体 / 行内代码 / 代码块(语法高亮) /
//       表格 / 列表 / 引用块 / 链接 / LaTeX 占位
// 无外部依赖，自包含实现
// 所有样式走 CSS 变量，不硬编码色值
// ============================================

// ========== HTML 转义 ==========

function _escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// ========== 语法高亮（基础版） ==========

const _KEYWORDS = {
  js: ['const','let','var','function','return','if','else','for','while','switch','case','break','continue','class','extends','super','this','new','try','catch','finally','throw','typeof','instanceof','in','of','async','await','yield','import','export','default','from','as','delete','void','do','null','undefined','true','false','NaN'],
  python: ['def','return','if','elif','else','for','while','break','continue','class','import','from','as','try','except','finally','raise','with','lambda','yield','global','nonlocal','pass','None','True','False','and','or','not','in','is','del','assert','async','await'],
  html: [],
  css: [],
  json: ['true','false','null'],
  bash: ['echo','cd','ls','mkdir','rm','cp','mv','cat','grep','find','sudo','apt','npm','node','python','pip','git','docker','if','then','fi','for','do','done','while','case','esac'],
  sql: ['SELECT','FROM','WHERE','INSERT','INTO','UPDATE','DELETE','CREATE','TABLE','DROP','ALTER','ADD','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AND','OR','NOT','NULL','PRIMARY','KEY','FOREIGN','REFERENCES','DEFAULT','AUTOINCREMENT','UNIQUE','INDEX','DROP','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','DISTINCT','AS','COUNT','SUM','AVG','MIN','MAX','UNION','ALL','CASE','WHEN','THEN','ELSE','END'],
};

function _highlightCode(code, lang) {
  const escaped = _escapeHtml(code);
  if (!lang || !_KEYWORDS[lang]) {
    // 通用：只高亮字符串和注释
    return _highlightGeneric(escaped);
  }
  const keywords = _KEYWORDS[lang];
  let result = escaped;

  // 先保护字符串和注释（用占位符）
  const placeholders = [];
  const isComment = lang === 'python' || lang === 'bash' || lang === 'sql';
  const commentSingle = isComment ? '#' : '//';
  const commentPattern = isComment
    ? new RegExp(`(${commentSingle}[^\n]*)`, 'g')
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  result = result.replace(commentPattern, (m) => {
    const id = placeholders.length;
    placeholders.push({ type: 'comment', html: m });
    return `\x00C${id}\x00`;
  });

  // 字符串
  result = result.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, (m) => {
    const id = placeholders.length;
    placeholders.push({ type: 'string', html: m });
    return `\x00S${id}\x00`;
  });

  // 关键字
  for (const kw of keywords) {
    const re = new RegExp(`\\b(${kw})\\b`, 'g');
    result = result.replace(re, '<span class="md-code-kw">$1</span>');
  }

  // 数字
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="md-code-num">$1</span>');

  // 恢复占位符
  result = result.replace(/\x00([CS])(\d+)\x00/g, (m, type, id) => {
    const p = placeholders[parseInt(id)];
    if (!p) return m;
    const cls = type === 'C' ? 'md-code-comment' : 'md-code-str';
    return `<span class="${cls}">${p.html}</span>`;
  });

  return result;
}

function _highlightGeneric(escaped) {
  let result = escaped;
  // 字符串
  result = result.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, '<span class="md-code-str">$1</span>');
  // 注释
  result = result.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, '<span class="md-code-comment">$1</span>');
  return result;
}

// ========== 主渲染函数 ==========

export function renderMarkdown(text) {
  if (!text) return '';
  let src = String(text);

  // 1. 提取代码块（含语言标签）
  const codeBlocks = [];
  src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.replace(/\n$/, '') });
    return `\x00CODEBLOCK${id}\x00`;
  });

  // 2. 提取 LaTeX 块 ($$...$$ 和 $...$)
  const latexBlocks = [];
  src = src.replace(/\$\$([\s\S]*?)\$\$/g, (m, formula) => {
    const id = latexBlocks.length;
    latexBlocks.push({ display: true, formula: formula.trim() });
    return `\x00LATEXBLOCK${id}\x00`;
  });
  src = src.replace(/\$([^\$\n]+)\$/g, (m, formula) => {
    const id = latexBlocks.length;
    latexBlocks.push({ display: false, formula: formula.trim() });
    return `\x00LATEXINLINE${id}\x00`;
  });

  // 3. HTML 转义剩余内容
  src = _escapeHtml(src);

  // 恢复占位符标记（escapeHtml 会编码 \x00）
  src = src.replace(/\x00CODEBLOCK(\d+)\x00/g, (m, id) => `\x00CB${id}\x00`);
  src = src.replace(/\x00LATEXBLOCK(\d+)\x00/g, (m, id) => `\x00LB${id}\x00`);
  src = src.replace(/\x00LATEXINLINE(\d+)\x00/g, (m, id) => `\x00LI${id}\x00`);

  // 4. 按行处理块级元素
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  let inList = false;
  let listType = '';
  let inTable = false;
  let tableHeader = null;
  let tableRows = [];

  function _flushList() {
    if (inList) {
      out.push(`</${listType}>`);
      inList = false;
      listType = '';
    }
  }

  function _flushTable() {
    if (inTable) {
      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (const h of tableHeader) {
        html += `<th>${h}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const row of tableRows) {
        html += '<tr>';
        for (const cell of row) {
          html += `<td>${cell}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      out.push(html);
      inTable = false;
      tableHeader = null;
      tableRows = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // 代码块占位符
    const cbMatch = line.match(/\x00CB(\d+)\x00/);
    if (cbMatch) {
      _flushList();
      _flushTable();
      const idx = parseInt(cbMatch[1]);
      const block = codeBlocks[idx];
      if (block) {
        const langLabel = block.lang || 'text';
        const highlighted = _highlightCode(block.code, block.lang);
        out.push(`<div class="md-code-block">` +
          `<div class="md-code-header">` +
            `<span class="md-code-lang">${_escapeHtml(langLabel)}</span>` +
            `<button class="md-code-copy" data-action="copy-code">${'复制'}</button>` +
          `</div>` +
          `<pre class="md-code-pre"><code class="md-code-body">${highlighted}</code></pre>` +
        `</div>`);
      }
      i++;
      continue;
    }

    // LaTeX 块占位符
    const lbMatch = line.match(/\x00LB(\d+)\x00/);
    if (lbMatch) {
      _flushList();
      _flushTable();
      const idx = parseInt(lbMatch[1]);
      const block = latexBlocks[idx];
      if (block) {
        out.push(`<div class="md-latex-block">${_escapeHtml(block.formula)}</div>`);
      }
      i++;
      continue;
    }

    // 空行
    if (line.trim() === '') {
      _flushList();
      _flushTable();
      i++;
      continue;
    }

    // 标题 h1-h3
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      _flushList();
      _flushTable();
      const level = hMatch[1].length;
      const content = _renderInline(hMatch[2]);
      out.push(`<h${level} class="md-h${level}">${content}</h${level}>`);
      i++;
      continue;
    }

    // 引用块
    if (line.startsWith('&gt;')) {
      _flushList();
      _flushTable();
      const quoteContent = _renderInline(line.replace(/^&gt;\s?/, ''));
      out.push(`<blockquote class="md-quote">${quoteContent}</blockquote>`);
      i++;
      continue;
    }

    // 表格行（含 | 分隔）
    if (line.includes('|') && line.trim().startsWith('|')) {
      _flushList();
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      // 检测分隔行 |---|---|
      if (cells.every(c => /^[-:]+$/.test(c))) {
        i++;
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeader = cells.map(c => _renderInline(c));
        tableRows = [];
      } else {
        tableRows.push(cells.map(c => _renderInline(c)));
      }
      i++;
      continue;
    } else {
      _flushTable();
    }

    // 无序列表
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (ulMatch) {
      _flushTable();
      if (!inList || listType !== 'ul') {
        _flushList();
        out.push('<ul class="md-list">');
        inList = true;
        listType = 'ul';
      }
      out.push(`<li>${_renderInline(ulMatch[2])}</li>`);
      i++;
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      _flushTable();
      if (!inList || listType !== 'ol') {
        _flushList();
        out.push('<ol class="md-list">');
        inList = true;
        listType = 'ol';
      }
      out.push(`<li>${_renderInline(olMatch[2])}</li>`);
      i++;
      continue;
    }

    // LaTeX 行内占位符
    const liMatch = line.match(/\x00LI(\d+)\x00/);
    if (liMatch) {
      _flushList();
      _flushTable();
      const idx = parseInt(liMatch[1]);
      const block = latexBlocks[idx];
      if (block) {
        out.push(`<span class="md-latex-inline">${_escapeHtml(block.formula)}</span>`);
      }
      i++;
      continue;
    }

    // 普通段落
    _flushList();
    _flushTable();
    out.push(`<p class="md-p">${_renderInline(line)}</p>`);
    i++;
  }

  _flushList();
  _flushTable();

  let html = out.join('\n');

  // 恢复行内 LaTeX
  html = html.replace(/\x00LI(\d+)\x00/g, (m, id) => {
    const block = latexBlocks[parseInt(id)];
    if (block) {
      return `<span class="md-latex-inline">${_escapeHtml(block.formula)}</span>`;
    }
    return '';
  });

  return html;
}

// ========== 行内渲染 ==========

function _renderInline(text) {
  let result = text;

  // 行内代码（先处理，避免内部被其他规则影响）
  const codeSpans = [];
  result = result.replace(/`([^`]+)`/g, (m, code) => {
    const id = codeSpans.length;
    codeSpans.push(code);
    return `\x00CS${id}\x00`;
  });

  // 链接 [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
    return `<a class="md-link" href="#" data-url="${_escapeAttr(url)}">${label}</a>`;
  });

  // 粗体 **
  result = result.replace(/\*\*([^\*]+)\*\*/g, '<strong class="md-strong">$1</strong>');

  // 斜体 *
  result = result.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em class="md-em">$1</em>');

  // 删除线 ~~
  result = result.replace(/~~([^~]+)~~/g, '<del class="md-del">$1</del>');

  // 恢复行内代码
  result = result.replace(/\x00CS(\d+)\x00/g, (m, id) => {
    const code = codeSpans[parseInt(id)];
    return `<code class="md-code-inline">${_escapeHtml(code)}</code>`;
  });

  return result;
}

function _escapeAttr(text) {
  if (!text) return '';
  return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export { renderMarkdown };
export default { renderMarkdown };
