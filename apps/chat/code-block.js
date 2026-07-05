// apps/chat/code-block.js
// 代码块增强：工具栏（复制 / 下载 / 预览 / 折叠）+ 全屏 HTML 预览 overlay。
// 由 markdown.js 输出带 .md-code-wrap 结构的 HTML，本模块负责给它"通电"——
// 绑定按钮事件、长代码默认折叠、HTML 代码一键全屏预览。
// 在 detail-view.js / group-detail-view.js / sending.js / group-sending.js 里，
// 每次把 renderMarkdown() 的结果塞进 innerHTML 之后，都要调一次 enhanceCodeBlocks(el)。
// 全中文注释；不省 token；功能不阉割。

import { showToast, createIcon, registerIcon } from '../../core/ui.js';
import { injectStyle } from '../../core/util.js';

// 注册折叠用的箭头图标（chevron-down 已存在，这里再注册一个 code-icon 给按钮用）
registerIcon('copy', 'M20 14h-7a2 2 0 0 1-2-2V5 M14 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z');
registerIcon('download', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3');
registerIcon('eye', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
registerIcon('external', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3');
registerIcon('rotate', 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15');

// 折叠阈值：代码行数超过这个值，默认折叠到固定高度
const COLLAPSE_THRESHOLD = 18;
const COLLAPSE_HEIGHT = 180; // px

// 一次性注入样式
let _styleInjected = false;
function ensureStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  injectStyle('app-chat-code-block', `
    /* ── 代码块容器 ── */
    .md-code-wrap{
      margin:8px 0; border-radius:var(--radius-md);
      border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
      background:color-mix(in srgb, var(--bg-card) 92%, #000 8%);
      overflow:hidden; transition:var(--motion);
    }
    .md-code-head{
      display:flex; align-items:center; gap:8px;
      padding:6px 10px;
      background:color-mix(in srgb, var(--text-hint) 10%, transparent);
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
      font-size:var(--font-size-small);
    }
    .md-code-lang{
      color:var(--text-hint); font-weight:600; text-transform:uppercase;
      letter-spacing:0.5px; font-size:11px; flex-shrink:0;
    }
    .md-code-actions{
      margin-left:auto; display:flex; align-items:center; gap:2px;
    }
    .md-code-btn{
      display:inline-flex; align-items:center; gap:4px;
      padding:3px 8px; border:none; background:transparent;
      color:var(--text-secondary); font-size:11px;
      border-radius:var(--radius-sm); cursor:pointer;
      transition:var(--motion); line-height:1.4;
    }
    .md-code-btn:active{ transform:scale(var(--press-scale)); }
    .md-code-btn:hover{ background:color-mix(in srgb, var(--text-hint) 16%, transparent); color:var(--text-primary); }
    .md-code-btn.md-code-toggle{ padding:3px 6px; }
    .md-code-btn.md-code-toggle svg{ transition:transform var(--motion); }
    .md-code-wrap[data-collapsed="true"] .md-code-btn.md-code-toggle svg{ transform:rotate(-90deg); }

    /* ── 代码主体 ── */
    .md-code-body{
      position:relative; max-height:none; overflow:hidden;
      transition:max-height 0.24s ease;
    }
    .md-code-wrap[data-collapsed="true"] .md-code-body{
      max-height:${COLLAPSE_HEIGHT}px;
    }
    /* 折叠时的底部渐变遮罩，提示"还有内容，点击展开" */
    .md-code-wrap[data-collapsed="true"] .md-code-body::after{
      content:''; position:absolute; left:0; right:0; bottom:0; height:48px;
      background:linear-gradient(to bottom, transparent, var(--bg-card));
      pointer-events:none;
    }
    .md-code-wrap[data-collapsed="true"] .md-code-body{ cursor:pointer; }

    /* 代码块本身样式 */
    .md-pre{
      margin:0; padding:12px 14px; overflow-x:auto;
      font-family:var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
      font-size:13px; line-height:1.6;
      color:var(--text-primary);
      background:transparent;
      -webkit-overflow-scrolling:touch;
    }
    .md-code-block{
      font-family:inherit; white-space:pre; word-break:normal;
    }

    /* ── 全屏预览 overlay ── */
    .md-preview-overlay{
      position:fixed; inset:0; z-index:9999;
      background:var(--bg-app);
      display:flex; flex-direction:column;
      animation:mdPreviewIn 0.2s ease;
    }
    @keyframes mdPreviewIn{
      from{ opacity:0; transform:scale(0.98); }
      to{ opacity:1; transform:scale(1); }
    }
    .md-preview-header{
      display:flex; align-items:center; gap:10px;
      padding:10px 14px;
      background:var(--bg-card);
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
      flex-shrink:0;
    }
    .md-preview-title{
      flex:1; min-width:0; font-size:14px; font-weight:600;
      color:var(--text-primary);
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .md-preview-btn{
      display:inline-flex; align-items:center; gap:5px;
      padding:6px 12px; border:none; border-radius:var(--radius-sm);
      background:color-mix(in srgb, var(--accent) 12%, transparent);
      color:var(--accent-dark); font-size:13px; cursor:pointer;
      transition:var(--motion);
    }
    .md-preview-btn:active{ transform:scale(var(--press-scale)); }
    .md-preview-btn.ghost{
      background:transparent; color:var(--text-secondary);
    }
    .md-preview-btn.ghost:hover{ background:color-mix(in srgb, var(--text-hint) 14%, transparent); }
    .md-preview-body{
      flex:1; min-height:0; position:relative;
      background:#fff;
    }
    .md-preview-body iframe{
      width:100%; height:100%; border:none; display:block;
      background:#fff;
    }
    .md-preview-empty{
      display:flex; align-items:center; justify-content:center;
      height:100%; color:var(--text-hint); font-size:14px;
    }

    /* 暗色模式下预览区保持白底（HTML 预览要还原真实渲染效果） */
    @media (prefers-color-scheme: dark){
      .md-preview-body{ background:#fff; }
    }
  `);
}

// ════════════════════════════════════════
// 主入口：给容器内所有代码块通电
// ════════════════════════════════════════

/**
 * 给 container 内的 .md-code-wrap 绑定交互（复制/下载/预览/折叠）。
 * 幂等：已增强过的（带 data-enhanced）会跳过。
 * 流式更新时可以反复调用，新出现的代码块会被增强。
 * @param {ParentNode} container 消息气泡元素
 */
export function enhanceCodeBlocks(container) {
  if (!container) return;
  ensureStyle();
  const wraps = container.querySelectorAll('.md-code-wrap:not([data-enhanced])');
  wraps.forEach((wrap) => {
    wrap.setAttribute('data-enhanced', '1');
    const body = wrap.querySelector('.md-code-body');
    const codeEl = wrap.querySelector('.md-code-block');
    if (!codeEl) return;
    const rawCode = codeEl.textContent || '';

    // 长代码默认折叠
    const lineCount = rawCode.split('\n').length;
    if (lineCount > COLLAPSE_THRESHOLD) {
      wrap.setAttribute('data-collapsed', 'true');
    } else {
      wrap.setAttribute('data-collapsed', 'false');
    }

    // 折叠按钮
    const toggleBtn = wrap.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.innerHTML = createIcon('chevron-down', 14).outerHTML;
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = wrap.getAttribute('data-collapsed') === 'true';
        wrap.setAttribute('data-collapsed', cur ? 'false' : 'true');
      });
    }
    // 折叠状态下点击 body 也能展开（更符合直觉）
    if (body) {
      body.addEventListener('click', (e) => {
        if (wrap.getAttribute('data-collapsed') !== 'true') return;
        wrap.setAttribute('data-collapsed', 'false');
      });
    }

    // 复制
    const copyBtn = wrap.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.innerHTML = createIcon('copy', 13).outerHTML + '<span>复制</span>';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyText(rawCode).then((ok) => {
          showToast(ok ? '复制好啦' : '复制失败了，再试一下嘛', ok ? 'default' : 'error', 1200);
          if (ok) {
            copyBtn.innerHTML = createIcon('check', 13).outerHTML + '<span>已复制</span>';
            setTimeout(() => {
              copyBtn.innerHTML = createIcon('copy', 13).outerHTML + '<span>复制</span>';
            }, 1500);
          }
        });
      });
    }

    // 下载
    const dlBtn = wrap.querySelector('[data-action="download"]');
    if (dlBtn) {
      dlBtn.innerHTML = createIcon('download', 13).outerHTML + '<span>下载</span>';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadCode(rawCode, wrap.getAttribute('data-lang') || 'txt');
        showToast('已下载到本地啦', 'default', 1200);
      });
    }

    // HTML 预览
    const pvBtn = wrap.querySelector('[data-action="preview"]');
    if (pvBtn) {
      pvBtn.innerHTML = createIcon('eye', 13).outerHTML + '<span>预览</span>';
      pvBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreviewOverlay(rawCode, wrap.getAttribute('data-lang') || 'html');
      });
    }
  });
}

// ════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════

/** 复制文本到剪贴板，返回是否成功 */
function copyText(text) {
  // 优先用现代 API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

// 降级方案：用临时 textarea + execCommand
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/** 下载代码为文件 */
function downloadCode(code, lang) {
  const ext = extOfLang(lang);
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `code_${Date.now()}.${ext}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// 语言名 -> 文件扩展名
function extOfLang(lang) {
  const map = {
    html: 'html', htm: 'html', xml: 'xml', svg: 'svg',
    js: 'js', javascript: 'js', jsx: 'jsx', ts: 'ts', typescript: 'ts', tsx: 'tsx',
    css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yml',
    py: 'py', python: 'py',
    java: 'java', c: 'c', cpp: 'cpp', cs: 'cs',
    go: 'go', rust: 'rs', rs: 'rs',
    php: 'php', ruby: 'rb', rb: 'rb',
    sql: 'sql', sh: 'sh', bash: 'sh', shell: 'sh',
    md: 'md', markdown: 'md',
    vue: 'vue', svelte: 'svelte'
  };
  return map[String(lang).toLowerCase()] || 'txt';
}

// ════════════════════════════════════════
// 全屏 HTML 预览
// ════════════════════════════════════════

/** 当前打开的预览 overlay（同时只允许一个） */
let _currentPreview = null;

/**
 * 打开全屏 HTML 预览。
 * @param {string} code HTML 源码
 * @param {string} lang 语言（html/svg/xml）
 */
export function openPreviewOverlay(code, lang = 'html') {
  // 先关掉已有的
  closePreviewOverlay();

  const overlay = document.createElement('div');
  overlay.className = 'md-preview-overlay';
  overlay.innerHTML = `
    <div class="md-preview-header">
      <button class="md-preview-btn ghost" data-action="close" type="button" aria-label="关闭预览">
        ${createIcon('back', 20).outerHTML}
      </button>
      <div class="md-preview-title">HTML 预览</div>
      <button class="md-preview-btn ghost" data-action="refresh" type="button" aria-label="刷新预览">
        ${createIcon('rotate', 18).outerHTML}<span>刷新</span>
      </button>
      <button class="md-preview-btn" data-action="open-window" type="button" aria-label="在新窗口打开">
        ${createIcon('external', 16).outerHTML}<span>新窗口</span>
      </button>
    </div>
    <div class="md-preview-body">
      <iframe sandbox="allow-scripts allow-forms allow-popups allow-modals" title="HTML 预览"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
  _currentPreview = overlay;

  const iframe = overlay.querySelector('iframe');
  const writeDoc = () => {
    // srcdoc 比 document.write 更干净，且支持 sandbox
    iframe.srcdoc = code;
  };
  writeDoc();

  // 关闭
  overlay.querySelector('[data-action="close"]').addEventListener('click', closePreviewOverlay);
  // 刷新
  overlay.querySelector('[data-action="refresh"]').addEventListener('click', () => {
    writeDoc();
    showToast('已刷新', 'default', 800);
  });
  // 新窗口打开
  overlay.querySelector('[data-action="open-window"]').addEventListener('click', () => {
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  // 物理返回键支持（移动端）
  try {
    history.pushState({ _mdPreview: true }, '');
  } catch (e) {}
  const _onPop = () => {
    closePreviewOverlay();
    window.removeEventListener('popstate', _onPop);
  };
  window.addEventListener('popstate', _onPop);
  overlay._onPop = _onPop;

  // ESC 关闭
  const _onKey = (e) => {
    if (e.key === 'Escape') {
      closePreviewOverlay();
    }
  };
  window.addEventListener('keydown', _onKey);
  overlay._onKey = _onKey;
}

/** 关闭预览 overlay */
export function closePreviewOverlay() {
  if (!_currentPreview) return;
  const ov = _currentPreview;
  _currentPreview = null;
  // 清事件
  if (ov._onPop) {
    window.removeEventListener('popstate', ov._onPop);
    // 如果是我们 push 的 state，回退一步
    try {
      if (history.state && history.state._mdPreview) {
        history.back();
      }
    } catch (e) {}
  }
  // _onKey 主动解绑（之前用 once，关闭按钮关闭时不会解绑，会泄漏到下次 ESC）
  if (ov._onKey) {
    window.removeEventListener('keydown', ov._onKey);
  }
  // 清掉 iframe 的 srcdoc，释放里面的脚本上下文
  try {
    const ifr = ov.querySelector('iframe');
    if (ifr) ifr.srcdoc = '';
  } catch (e) {}
  // 移除 DOM
  if (ov.parentNode) {
    ov.parentNode.removeChild(ov);
  }
}

export default { enhanceCodeBlocks, openPreviewOverlay, closePreviewOverlay };
